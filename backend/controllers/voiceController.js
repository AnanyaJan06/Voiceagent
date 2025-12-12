// backend/controllers/voiceController.js
// Step-state controller + Llama NLU + minimal NLG + validation + DB save

import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js'; // expects a function that returns Llama text

// --- Helpers: validation, continuation prompts, affirmative detection fallback
const PHONE_REGEX = /\b(\d{10})\b/;
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ZIP_REGEX = /\b\d{5,6}\b/;
const YEAR_REGEX = /\b(19|20)\d{2}\b/;

function continuationPrompt(step) {
  switch (step) {
    case 'name': return "May I have your name, please?";
    case 'mobile': return "May I have your mobile number, please?";
    case 'mobile_confirm': return "Is that number correct? Please say Yes or No.";
    case 'email': return "May I have your email address, please?";
    case 'zip': return "May I know your ZIP code, please?";
    case 'zip_confirm': return "Is that ZIP code correct? Please say Yes or No.";
    case 'part': return "What part are you looking for?";
    case 'make': return "Please tell me the vehicle make, for example, Honda or Toyota.";
    case 'model': return "What is the model name?";
    case 'year': return "What is the year of manufacture?";
    case 'trim': return "Do you know the trim or variant? If not, say I don't know.";
    case 'final_confirm': return "Are all the details correct? Please say Yes to confirm.";
    default: return "How can I help you with auto parts today?";
  }
}

// Small local affirmative/negative fallback (fast local check)
function localAffirmative(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const yesWords = ["yes","yeah","yep","yup","ok","okay","sure","correct","right","absolutely","indeed","thats correct","that is correct","confirmed"];
  return yesWords.some(w => t.includes(w));
}
function localNegative(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const noWords = ["no","nope","nah","incorrect","wrong","not","dont","don't"];
  // be careful: "don't know" is not a negative for confirm; handled separately
  return noWords.some(w => t.includes(w));
}

// --- Llama / NLU helper: ask Llama to return strict JSON for intent & entities
async function runNLU(userUtterance, currentStep) {
  // Prompt instructs Llama to output JSON only. Keep temp low in askLlama implementation.
  const prompt = `
You are a strict NLU extractor. Output ONLY valid JSON (no extra text).
Input:
user_utterance: """${userUtterance.replace(/"/g, '\\"')}"""
current_step: "${currentStep}"

Return JSON with schema:
{
  "intent": one of ["confirm","deny","provide_slot","ask_price","ask_warranty","other"],
  "entities": {
    "phone": "digits or null",
    "email": "string or null",
    "zip": "digits or null",
    "make": "string or null",
    "model": "string or null",
    "year": "YYYY or null",
    "trim": "string or null"
  },
  "confidence": 0.0
}
Make "confidence" a number between 0 and 1. If unsure, return confidence < 0.7.
`;

  try {
    const text = await askLlama(prompt); // implement askLlama to call Groq/Llama with temp=0
    // try to parse JSON out (defensive)
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      // attempt to extract JSON substring
      const m = text.match(/\{[\s\S]*\}/);
      if (m) json = JSON.parse(m[0]);
      else throw e;
    }
    return json;
  } catch (err) {
    console.warn("NLU failed:", err);
    // fallback: primitive keyword detection
    const l = userUtterance.toLowerCase();
    if (l.includes('price') || l.includes('how much') || l.includes('cost')) {
      return { intent: "ask_price", entities: {}, confidence: 0.9 };
    }
    if (l.includes('warranty') || l.includes('guarantee')) {
      return { intent: "ask_warranty", entities: {}, confidence: 0.9 };
    }
    // try to detect phone/email/zip by regex locally
    const phone = userUtterance.replace(/\D/g,'').match(/(\d{10})$/)?.[0] || null;
    const email = (userUtterance.match(EMAIL_REGEX) || [null])[0];
    const zip = (userUtterance.match(ZIP_REGEX) || [null])[0];
    return { intent: "other", entities: { phone, email, zip, make: null, model: null, year: null, trim: null }, confidence: 0.5 };
  }
}

// Optional NLG: ask Llama to produce 1 short sentence for the assistant
async function runNLG(nextStep, context = {}) {
  // If you prefer speed/reliability you can use canned prompts below instead of calling Llama every time.
  const canned = continuationPrompt(nextStep);
  // Try to call Llama but fallback to canned if anything goes wrong or if you want deterministic behavior.
  try {
    const prompt = `
You are a polite phone assistant. Return EXACTLY one short sentence to ask the user for the next required information.
Step: ${nextStep}
Context: ${JSON.stringify(context)}
Return only the single sentence (no quotes).
`;
    const text = await askLlama(prompt);
    // sanitize: keep only first line, no extra newlines
    const line = text.split(/\r?\n/).find(Boolean) || canned;
    return line.trim();
  } catch (e) {
    return canned;
  }
}

// Helper: validate and normalize entity values using regex fallbacks
function applyEntityFallbacks(nlu, userSpeech, session, customerPhone) {
  const entities = nlu.entities || {};
  // phone: priority: regex from userSpeech, else callerID if not set
  let phone = entities.phone || null;
  if (!phone) {
    const digits = userSpeech.replace(/\D/g,'');
    if (digits.length >= 10) phone = digits.slice(-10);
  }
  if (!phone && session.phoneNumber) phone = session.phoneNumber;
  if (phone && !/^\d{10}$/.test(phone)) phone = null;

  // email
  let email = entities.email || null;
  const emailMatch = userSpeech.match(EMAIL_REGEX);
  if (!email && emailMatch) email = emailMatch[0];

  // zip
  let zip = entities.zip || null;
  const zipMatch = userSpeech.match(ZIP_REGEX);
  if (!zip && zipMatch) zip = zipMatch[0];

  // year
  let year = entities.year || null;
  const yearMatch = userSpeech.match(YEAR_REGEX);
  if (!year && yearMatch) year = yearMatch[0];

  // other simple strings
  const make = entities.make || null;
  const model = entities.model || null;
  const trim = entities.trim || null;

  return {
    phone, email, zip, year, make, model, trim
  };
}

// --- Controller handlers
export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  updateSession(callSid, {
    step: 'greeting',
    clientName: null,
    phoneNumber: null,
    email: null,
    zip: null,
    partRequested: null,
    make: null,
    model: null,
    year: null,
    trim: null,
    leadSaved: false,
    retries: {},
    history: []
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    profanityFilter: false,
  });

  gather.say('Hello! Welcome to Firstused Autoparts. How can I help you today?');
  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;
  const customerPhone = (req.body.From || '').replace('+91',''); // adjust for region
  console.log('Customer said:', userSpeech);

  const session = getSession(callSid) || {};
  session.retries = session.retries || {};
  session.history = session.history || [];
  session.history.push({ role: "user", content: userSpeech });

  // Quick NLU (use Llama + fallback)
  let nlu = await runNLU(userSpeech, session.step);
  // Apply local fallback extraction & normalization
  const extracted = applyEntityFallbacks(nlu, userSpeech, session, customerPhone);

  // Handle interruptions first (price/warranty)
  if (nlu.intent === 'ask_price' || nlu.intent === 'ask_warranty') {
    const aiResponse = nlu.intent === 'ask_price'
      ? "Our pricing depends on the exact part condition and availability. Our representative will contact you shortly with the correct price. Let's continue with your details."
      : "We normally provide 3 to 12 months warranty depending on the part. Our representative will give you the exact warranty details. Let's continue.";
    session.history.push({ role: "assistant", content: aiResponse });
    updateSession(callSid, session);

    const twiml = new VoiceResponse();
    const audio = await synthesizeText(aiResponse);
    if (audio) twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
    else twiml.say({ voice: 'Polly.Joanna' }, aiResponse);

    // Re-ask the current step using NLG or canned
    const followUp = await runNLG(session.step, session);
    const audio2 = await synthesizeText(followUp);
    if (audio2) twiml.play(`data:audio/wav;base64,${audio2.toString('base64')}`);
    else twiml.say({ voice: 'Polly.Joanna' }, followUp);

    const gather = twiml.gather({ input: 'speech', action: '/api/voice/speech', method: 'POST', speechTimeout: 'auto' });
    res.type('text/xml').send(twiml.toString());
    return;
  }

  // MAIN state machine (server authoritative)
  let response = "";
  // helper to increment retry count
  function incRetry(key) {
    session.retries[key] = (session.retries[key] || 0) + 1;
    return session.retries[key];
  }

  switch (session.step) {
    case 'greeting':
      response = "Thank you for calling. May I know your name, please?";
      session.step = 'name';
      break;

    case 'name':
      // Accept NLU-provided name if available otherwise raw speech
      session.clientName = (extracted.make === null && extracted.model === null && userSpeech) ? userSpeech : userSpeech;
      response = `Thank you, ${session.clientName}. May I have your mobile number so our team can contact you?`;
      session.step = 'mobile';
      break;

    case 'mobile':
      // Prefer caller ID as default; if user spoke digits, extractor will find them
      if (extracted.phone) {
        session.phoneNumber = extracted.phone;
        // confirm spoken phone
        const formatted = session.phoneNumber.replace(/(\d{5})(\d{5})/, '$1 $2');
        response = `Just to confirm, your number is ${formatted}. Is that correct?`;
        session.step = 'mobile_confirm';
      } else if (customerPhone) {
        // use caller ID but ask for confirmation
        session.phoneNumber = customerPhone;
        const formatted = customerPhone.replace(/(\d{5})(\d{5})/, '$1 $2');
        response = `Just to confirm, your number is ${formatted}. Is that correct?`;
        session.step = 'mobile_confirm';
      } else {
        response = "Sorry, I couldn't detect a phone number. Please say your 10-digit mobile number.";
        session.step = 'mobile';
        if (incRetry('mobile') >= 3) {
          response = "I am having trouble capturing your number. Would you like me to connect you to our customer service?";
          session.step = 'offer_transfer';
        }
      }
      break;

    case 'mobile_confirm':
      // use Llama NLU intent if available; fallback to local checks
      const confirmIntent = nlu.intent === 'confirm' ? 'confirm' : (nlu.intent === 'deny' ? 'deny' : null);
      if (!confirmIntent) {
        if (localAffirmative(userSpeech)) confirmIntent = 'confirm';
        else if (localNegative(userSpeech)) confirmIntent = 'deny';
      }
      if (confirmIntent === 'confirm') {
        response = "Perfect. May I have your email ID?";
        session.step = 'email';
      } else if (confirmIntent === 'deny') {
        response = "Sorry about that. Please tell me your correct mobile number.";
        session.step = 'mobile';
      } else {
        response = "I didn't catch that clearly. Is your number correct? Please say Yes or No.";
        // keep mobile_confirm
      }
      break;

    case 'email':
      // Try to validate email from extractor or raw speech
      if (extracted.email) {
        session.email = extracted.email;
        response = `Got it — ${session.email}. If there's any spelling mistake, our team will fix it. Now, may I know your ZIP code?`;
        session.step = 'zip';
      } else {
        const ematch = userSpeech.match(EMAIL_REGEX);
        if (ematch) {
          session.email = ematch[0];
          response = `Got it — ${session.email}. If there's any spelling mistake, our team will fix it. Now, may I know your ZIP code?`;
          session.step = 'zip';
        } else {
          response = "I couldn't detect a valid email. Could you please repeat your email address?";
          if (incRetry('email') >= 3) {
            response = "I am having trouble capturing your email. Would you like me to connect you to our customer service?";
            session.step = 'offer_transfer';
          } else {
            session.step = 'email';
          }
        }
      }
      break;

    case 'zip':
      // Support "don't know"
      if (/don't know|dont know|not sure|i don't know/i.test(userSpeech.toLowerCase())) {
        session.zip = "00000";
        response = "No problem at all. Our representative will take care of it. What part are you looking for?";
        session.step = 'part';
      } else if (extracted.zip) {
        session.zip = extracted.zip;
        response = `Your ZIP code is ${session.zip}, correct?`;
        session.step = 'zip_confirm';
      } else {
        const zm = userSpeech.match(ZIP_REGEX);
        if (zm) {
          session.zip = zm[0];
          response = `Your ZIP code is ${session.zip}, correct?`;
          session.step = 'zip_confirm';
        } else {
          response = "I didn't catch your ZIP. Could you please repeat the pin code?";
          if (incRetry('zip') >= 3) {
            response = "I am having trouble capturing your ZIP code. Would you like our representative to handle it? I will save it as 00000 for now.";
            session.zip = "00000";
            session.step = 'part';
          }
        }
      }
      break;

    case 'zip_confirm':
      if (localAffirmative(userSpeech) || nlu.intent === 'confirm') {
        response = "Great. What part are you looking for?";
        session.step = 'part';
      } else if (localNegative(userSpeech) || nlu.intent === 'deny') {
        response = "Sorry, please tell me your ZIP code again.";
        session.step = 'zip';
      } else {
        response = "I didn't catch that. Is the ZIP code correct? Please say Yes or No.";
        // keep zip_confirm
      }
      break;

    case 'part':
      if (extracted && userSpeech) {
        session.partRequested = userSpeech;
        response = "Thank you. Now, may I know the make of your vehicle? For example, Honda or Toyota.";
        session.step = 'make';
      } else {
        response = "I didn't catch that. Which part are you looking for?";
        if (incRetry('part') >= 3) {
          response = "Would you like me to connect you to our customer service for help identifying the part?";
          session.step = 'offer_transfer';
        } else {
          session.step = 'part';
        }
      }
      break;

    case 'make':
      if (userSpeech) {
        session.make = userSpeech;
        response = "What is the model name?";
        session.step = 'model';
      } else {
        response = "Could you repeat the vehicle make?";
      }
      break;

    case 'model':
      if (userSpeech) {
        session.model = userSpeech;
        response = "And the year of manufacture?";
        session.step = 'year';
      } else {
        response = "Could you repeat the model name?";
      }
      break;

    case 'year':
      if (extracted.year) {
        session.year = extracted.year;
        response = "Finally, do you know the trim or variant? If not, just say I don't know.";
        session.step = 'trim';
      } else {
        const ym = userSpeech.match(YEAR_REGEX);
        if (ym) {
          session.year = ym[0];
          response = "Finally, do you know the trim or variant? If not, just say I don't know.";
          session.step = 'trim';
        } else if (/don't know|dont know|not sure/i.test(userSpeech.toLowerCase())) {
          session.year = "Unknown";
          response = "No problem. What about the trim? If you don't know, say I don't know.";
          session.step = 'trim';
        } else {
          response = "I didn't get the year. Could you say the year of manufacture?";
          if (incRetry('year') >= 3) {
            session.year = "Unknown";
            response = "No problem, I'll leave the year blank and our representative will help. What about the trim?";
            session.step = 'trim';
          }
        }
      }
      break;

    case 'trim':
      if (/don't know|dont know|not sure/i.test(userSpeech.toLowerCase())) {
        session.trim = "Unknown";
      } else {
        session.trim = userSpeech;
      }

      response = `Let me repeat your details:
Name: ${session.clientName}
Mobile: ${session.phoneNumber ? session.phoneNumber.replace(/(\d{5})(\d{5})/, '$1 $2') : 'not provided'}
Part: ${session.partRequested || 'not provided'}
Vehicle: ${session.make || ''} ${session.model || ''} ${session.year || ''} ${session.trim || ''}

Is everything correct?`;
      session.step = 'final_confirm';
      break;

    case 'final_confirm':
      if (localAffirmative(userSpeech) || nlu.intent === 'confirm') {
        // Validate critical fields before saving
        const phoneOk = session.phoneNumber && /^\d{10}$/.test(session.phoneNumber);
        if (!phoneOk) {
          response = "I don't have a valid phone number. Please tell me your 10-digit mobile number.";
          session.step = 'mobile';
          break;
        }

        // Ensure email default if invalid
        if (!session.email || !EMAIL_REGEX.test(session.email)) session.email = session.email || "voice@firstused.com";
        if (!session.zip || !ZIP_REGEX.test(session.zip)) session.zip = session.zip || "00000";

        try {
          await Lead.create({
            clientName: session.clientName || "Voice Lead",
            phoneNumber: session.phoneNumber,
            email: session.email,
            zip: session.zip,
            partRequested: session.partRequested || "Unknown",
            make: session.make || "Unknown",
            model: session.model || "Unknown",
            year: session.year || "Unknown",
            trim: session.trim || "Unknown",
            status: "Quoted",
            notes: [{ text: `Voice AI Lead. Conversation captured.`, addedBy: "AI Agent" }],
            createdBy: false
          });
          console.log("NEW LEAD SAVED!");
          session.leadSaved = true;
        } catch (e) {
          console.error("Save failed:", e);
          // Inform user and continue
          response = "I couldn't save the details due to a technical problem. Our representative will still contact you. Thank you.";
          session.step = 'end';
          break;
        }

        response = "Thank you! Your details have been saved. Our team will contact you soon with pricing and availability. Have a great day!";
        session.step = 'end';
      } else if (localNegative(userSpeech) || nlu.intent === 'deny') {
        response = "Sorry about that. Which detail would you like to correct?";
        // Move to correction flow - simplest: ask name then allow correction - or ask which field
        session.step = 'name';
      } else {
        // unclear -> ask small clarifier
        response = "I didn't catch that clearly. Are all the details I repeated correct? Please say Yes or No.";
        // keep final_confirm
      }
      break;

    case 'offer_transfer':
      // If we offer a transfer option earlier and user says yes, handle it (example dial)
      if (localAffirmative(userSpeech)) {
        response = "Connecting you to customer service now. Please hold.";
        session.step = 'end';
        // In production you'd add TwiML <Dial> to connect the call; here we just inform
      } else {
        response = "Okay. Let's continue. " + continuationPrompt('mobile');
        session.step = 'mobile';
      }
      break;

    default:
      response = "How can I help you with auto parts today?";
      session.step = 'greeting';
  }

  // persist assistant history + session
  session.history.push({ role: "assistant", content: response });
  updateSession(callSid, session);

  // Play response (TTS)
  const twiml = new VoiceResponse();
  try {
    const audio = await synthesizeText(response);
    if (audio) twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
    else twiml.say({ voice: 'Polly.Joanna' }, response);
  } catch (err) {
    console.warn("TTS failed, falling back to TwiML.say", err);
    twiml.say({ voice: 'Polly.Joanna' }, response);
  }

  // Continue or end
  if (session.step !== 'end') {
    twiml.gather({ input: 'speech', action: '/api/voice/speech', method: 'POST', speechTimeout: 'auto' });
  } else {
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
};

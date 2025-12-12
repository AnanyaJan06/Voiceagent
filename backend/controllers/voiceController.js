// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';  // ← NOW FULLY USED!

const QUESTIONS = [
  "May I have your full name please?",
  "Thank you! Could you please confirm your phone number?",
  "Great! What is your email address?",
  "Perfect. What is your zip or pin code?",
  "Got it. What part are you looking for?",
  "Thank you. What is the make of your vehicle?",
  "And the model?",
  "What year is your vehicle?",
  "Finally, what is the trim or variant?"
];

const PRICE_REPLY = "Our pricing depends on the exact specifications and available options. To give you the correct and best price, our representative will contact you shortly.";
const WARRANTY_REPLY = "We usually offer 3 to 12 months warranty, depending on the part condition. Our representative will give you the accurate warranty details for you.";

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  updateSession(callSid, {
    phoneNumber: phone,
    step: 0,
    data: {},
    history: []
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  gather.say('Hello! Welcome to Firstused Autoparts. How may I assist you today?');

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  let step = session.step || 0;
  const data = session.data || {};
  const history = session.history || [];

  history.push({ role: "user", content: userSpeech });

  let response = "";
  const lower = userSpeech.toLowerCase();

  // BLOCK price/warranty
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    response = PRICE_REPLY;
  } else if (lower.includes('warranty') || lower.includes('guarantee')) {
    response = WARRANTY_REPLY;
  }
  // First message
  else if (step === 0) {
    data.partRequested = userSpeech;
    response = "Thank you! Our representative will contact you soon with pricing and availability. To proceed, may I have your full name please?";
    step = 1;
  }
  // Use AI to extract clean data from messy speech
  else if (step >= 1 && step < QUESTIONS.length) {
    const fieldNames = ['clientName', 'phoneNumber', 'email', 'zip', 'partRequested', 'make', 'model', 'year', 'trim'];
    const currentField = fieldNames[step - 1];

    // LET LLAMA EXTRACT CLEAN VALUE
    const cleanValue = await askLlama(`
Extract ONLY the ${currentField} from this sentence. Remove phrases like "my name is", "it's a", "the year is", etc.
Return ONLY the clean value, nothing else.

Customer said: "${userSpeech}"
Field: ${currentField}
Answer:`);

    data[currentField] = cleanValue.trim() || userSpeech.trim();

    if (step === QUESTIONS.length - 1) {
      // ALL DONE — SAVE CLEAN DATA TO DB
      try {
        await Lead.create({
          clientName: data.clientName || "Voice Customer",
          phoneNumber: data.phoneNumber || phone,
          email: data.email || "noemail@voicelead.com",
          zip: data.zip || "000000",
          partRequested: data.partRequested || "Not specified",
          make: data.make || "Unknown",
          model: data.model || "Unknown",
          year: data.year || "Unknown",
          trim: data.trim || "Not specified",
          status: "Quoted",
          notes: [{
            text: `AI Voice Lead - Raw: "${userSpeech}", Cleaned: ${JSON.stringify(data)}`,
            addedBy: "AI Voice Agent"
          }],
          createdBy: false
        });
        console.log("SMART LEAD SAVED → test.leads");
        response = "Thank you so much! All your details have been recorded perfectly. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
      } catch (err) {
        console.error("Save failed:", err);
        response = "Thank you! We have your request and will call you back soon.";
      }
    } else {
      response = QUESTIONS[step];
      step++;
    }
  }

  history.push({ role: "assistant", content: response });
  updateSession(callSid, { step, data, history });

  const twiml = new VoiceResponse();
  const audio = await synthesizeText(response);
  if (audio) {
    twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
  } else {
    twiml.say(response);
  }

  if (step < QUESTIONS.length) {
    const gather = twiml.gather({
      input: 'speech',
      action: '/api/voice/speech',
      method: 'POST',
      speechTimeout: 'auto'
    });
  } else {
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
};
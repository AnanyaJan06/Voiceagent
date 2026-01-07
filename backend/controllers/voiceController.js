// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';

const QUESTIONS = [
  "May I have your full name please?",
  "Thank you! What is your email address?",
  "Great! What is your zip or pin code?"
];

const PRICE_REPLY = "Our pricing depends on the exact specifications and available options. To give you the correct and best price, our representative will contact you shortly.";
const WARRANTY_REPLY = "We usually offer 3 to 12 months warranty, depending on the part condition. Our representative will give you the accurate warranty details for you.";

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  updateSession(callSid, {
    phoneNumber: phone,
    confirmedPhone: false,
    tempPhone: null,
    step: 0,
    data: {},
    conversation: []  // To save full conversation
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  gather.say({ voice: 'Polly.Joanna' },
    "Hello! Welcome to Firstused Autoparts. How may I assist you today?"
  );

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
  const conversation = session.conversation || [];

  conversation.push({ role: "customer", content: userSpeech });

  let response = "";

  const lower = userSpeech.toLowerCase();

  // PRICE & WARRANTY
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    response = PRICE_REPLY;
  } else if (lower.includes('warranty') || lower.includes('guarantee')) {
    response = WARRANTY_REPLY;
  }
  // FIRST MESSAGE — part request
  else if (step === 0) {
    data.partRequested = userSpeech;

    // Try to extract make, model, year
    const extracted = await askLlama(`Extract make, model, year from this sentence. If not present, return "none".

Customer said: "${userSpeech}"

Return as JSON: {"make": "...", "model": "...", "year": "..."}`);

    let vehicle = "";
    try {
      const parsed = JSON.parse(extracted);
      if (parsed.make && parsed.model && parsed.year && parsed.make !== "none") {
        vehicle = ` for ${parsed.year} ${parsed.make} ${parsed.model}`;
        data.vehicleDetails = `${parsed.year} ${parsed.make} ${parsed.model}`;
      }
    } catch (e) {
      // ignore
    }

    if (vehicle) {
      response = `Got it — ${data.partRequested}${vehicle}. Our representative will contact you soon with pricing and availability. To proceed, may I have your full name please?`;
      step = 1;
    } else {
      response = "Got it — you need " + data.partRequested + ". Could you please tell me the make, model, and year of your vehicle?";
      step = 0.5; // special step for vehicle
    }
  }
  // VEHICLE DETAILS (if not given in first message)
  else if (step === 0.5) {
    data.vehicleDetails = userSpeech;
    response = "Thank you! Our representative will contact you soon with pricing and availability. To proceed, may I have your full name please?";
    step = 1;
  }
  // PHONE NUMBER
  else if (step === 1 && !session.confirmedPhone) {
    const extracted = await askLlama(`Extract only the 10-digit mobile number from this English speech. Return only digits, nothing else.\nCustomer said: "${userSpeech}"`);
    const cleanPhone = extracted.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length === 10) {
      session.tempPhone = cleanPhone;
      response = `I have your number as ${cleanPhone.slice(0,5)} ${cleanPhone.slice(5)}. Is this correct? Please say yes or no.`;
      step = 1.5;
    } else {
      response = "Sorry, I didn't catch your number clearly. Could you please repeat your 10-digit mobile number?";
    }
  }
  else if (step === 1.5) {
    const decision = await askLlama(`Customer was asked: "Is this correct? Please say yes or no."\nCustomer replied: "${userSpeech}"\nAnswer only "YES" or "NO" in uppercase.`);

    if (decision.trim() === "YES") {
      data.phoneNumber = session.tempPhone;
      session.confirmedPhone = true;
      response = QUESTIONS[0]; // Ask name
      step = 2;
    } else {
      response = "No problem! Please say your 10-digit mobile number again clearly.";
      step = 1;
    }
  }
  // ONLY 3 QUESTIONS: Name → Email → Zip
  else if (session.confirmedPhone && step >= 2 && step < 2 + QUESTIONS.length) {
    const fieldIndex = step - 2;
    const fields = ['clientName', 'email', 'zip'];

    const cleanValue = await askLlama(`Extract only the ${fields[fieldIndex]} from this sentence. Remove filler words.\nCustomer said: "${userSpeech}"\nReturn only the clean value.`);
    data[fields[fieldIndex]] = cleanValue.trim() || userSpeech.trim();

    if (fieldIndex === QUESTIONS.length - 1) {
      // ALL DONE — SAVE TO test.leads with full conversation in notes
      const fullConversation = conversation.map(c => `${c.role}: ${c.content}`).join('\n');

      try {
        await Lead.create({
          clientName: data.clientName || "Voice Customer",
          phoneNumber: data.phoneNumber,
          email: data.email || "noemail@voicelead.com",
          zip: data.zip || "000000",
          partRequested: data.partRequested || "Not specified",
          make: "Not collected",
          model: "Not collected",
          year: "Not collected",
          trim: "Not specified",
          status: "Quoted",
          notes: [{
            text: `AI Voice Lead - Full conversation:\n${fullConversation}\nVehicle details: ${data.vehicleDetails || 'Not provided'}`,
            addedBy: "AI Voice Agent"
          }],
          createdBy: false
        });
        console.log("LEAD SAVED TO test.leads with full conversation!");
        response = "Thank you so much! All your details have been recorded. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
      } catch (err) {
        console.error("Save failed:", err);
        response = "Thank you! We have your request and will call you back soon.";
      }
    } else {
      response = QUESTIONS[fieldIndex + 1];
      step++;
    }
  }

  conversation.push({ role: "assistant", content: response });
  updateSession(callSid, { step, data, conversation });

  const twiml = new VoiceResponse();
  const audio = await synthesizeText(response);
  if (audio) {
    twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
  } else {
    twiml.say(response);
  }

  if (step < 2 + QUESTIONS.length) {
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
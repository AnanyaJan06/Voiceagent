// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';

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
    data: {
      partRequested: null,
      make: null,
      model: null,
      year: null,
      trim: null
    }
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

  let response = "";

  const lower = userSpeech.toLowerCase();

  // PRICE / WARRANTY — always answer
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    response = PRICE_REPLY;
  } else if (lower.includes('warranty') || lower.includes('guarantee')) {
    response = WARRANTY_REPLY;
  }
  // FIRST MESSAGE — extract part + vehicle in one go
  else if (step === 0) {
    const extracted = await askLlama(`Extract the following from this sentence:
- partRequested
- make
- model
- year
- trim

Return as JSON. If not mentioned, use null.

Customer said: "${userSpeech}"

Answer:`);

    let parsed = {};
    try {
      parsed = JSON.parse(extracted);
    } catch (e) {
      parsed = {};
    }

    data.partRequested = parsed.partRequested || userSpeech;
    data.make = parsed.make || null;
    data.model = parsed.model || null;
    data.year = parsed.year || null;
    data.trim = parsed.trim || null;

    response = "Got it — " + data.partRequested + " for " +
      (data.year ? data.year + " " : "") +
      (data.make ? data.make + " " : "") +
      (data.model ? data.model : "") +
      (data.trim ? " " + data.trim : "") +
      ". To proceed, could you please tell me your 10-digit mobile number?";

    step = 1;
  }
  // PHONE NUMBER
  else if (step === 1 && !session.confirmedPhone) {
    const extracted = await askLlama(`Extract only the 10-digit mobile number. Return digits only.\nCustomer said: "${userSpeech}"`);
    const cleanPhone = extracted.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length === 10) {
      session.tempPhone = cleanPhone;
      response = `I have your number as ${cleanPhone.slice(0,5)} ${cleanPhone.slice(5)}. Is this correct? Please say yes or no.`;
      step = 1.5;
    } else {
      response = "Sorry, I didn't catch your number. Please repeat your 10-digit mobile number.";
    }
  }
  else if (step === 1.5) {
    const decision = await askLlama(`Customer replied: "${userSpeech}"\nIs this yes or no? Answer only "YES" or "NO".`);

    if (decision.trim() === "YES") {
      data.phoneNumber = session.tempPhone;
      session.confirmedPhone = true;
      response = "May I have your full name please?";
      step = 2;
    } else {
      response = "No problem! Please say your 10-digit mobile number again.";
      step = 1;
    }
  }
  // PERSONAL INFO + MISSING VEHICLE FIELDS
  else if (session.confirmedPhone) {
    const personalFields = ['clientName', 'email', 'zip'];
    const vehicleFields = ['make', 'model', 'year', 'trim'];

    const personalIndex = step - 2;
    const vehicleIndex = step - 2 - personalFields.length;

    if (personalIndex < personalFields.length) {
      const field = personalFields[personalIndex];
      const cleanValue = await askLlama(`Extract only the ${field} from this sentence. Remove filler words.\nCustomer said: "${userSpeech}"\nReturn only the value.`);
      data[field] = cleanValue.trim() || userSpeech.trim();

      if (personalIndex === personalFields.length - 1) {
        // Personal info done — now ask missing vehicle fields
        const missingVehicle = vehicleFields.filter(f => !data[f]);
        if (missingVehicle.length === 0) {
          // ALL DONE
          await saveLead(data, phone);
          response = "Thank you so much! All your details have been recorded. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
        } else {
          response = `Thank you! To make sure we get the right part, could you please tell me the ${missingVehicle.join(" and ")} of your vehicle?`;
          step = step + 1; // move to vehicle questions
        }
      } else {
        response = QUESTIONS[personalIndex + 1];
        step++;
      }
    } else if (vehicleIndex < vehicleFields.length) {
      const field = vehicleFields[vehicleIndex];
      const cleanValue = await askLlama(`Extract only the ${field} from this sentence.\nCustomer said: "${userSpeech}"\nReturn only the value.`);
      data[field] = cleanValue.trim() || userSpeech.trim();

      const remaining = vehicleFields.slice(vehicleIndex + 1).filter(f => !data[f]);
      if (remaining.length === 0) {
        await saveLead(data, phone);
        response = "Thank you so much! All your details have been recorded. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
      } else {
        response = `Thank you! Could you please tell me the ${remaining.join(" and ")}?`;
        step++;
      }
    }
  }

  updateSession(callSid, { step, data });

  const twiml = new VoiceResponse();
  const audio = await synthesizeText(response);
  if (audio) {
    twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
  } else {
    twiml.say(response);
  }

  if (step < 10) {  // adjust based on flow
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

// Helper to save lead
async function saveLead(data, phone) {
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
        text: `AI Voice Lead - Part: ${data.partRequested}, Vehicle: ${data.make} ${data.model} ${data.year} ${data.trim}`,
        addedBy: "AI Voice Agent"
      }],
      createdBy: false
    });
    console.log("LEAD SAVED TO test.leads!");
  } catch (err) {
    console.error("Save failed:", err);
  }
}
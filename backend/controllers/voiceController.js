// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';  // ← AI BRAIN IS BACK!

const PRICE_REPLY = "Our pricing depends on the exact specifications and available options available. To give you the best and correct price, our representative will contact you shortly.";
const WARRANTY_REPLY = "We usually offer 3 to 12 months warranty depending on the part condition. Our representative will provide you with the accurate warranty details.";

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

  // Add to history for context
  history.push({ role: "user", content: userSpeech });

  let response = "";

  const lower = userSpeech.toLowerCase();

  // BLOCK price/warranty questions — ALWAYS use your exact reply
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much') || lower.includes('rate')) {
    response = PRICE_REPLY;
  } else if (lower.includes('warranty') || lower.includes('guarantee')) {
    response = WARRANTY_REPLY;
  }
  // First message — customer says what they want
  else if (step === 0) {
    data.partRequested = userSpeech;
    response = "Thank you! Our representative will contact you soon with pricing and availability. To proceed, may I have your full name please?";
    step = 1;
  }
  // Normal 9-question flow
  else if (step >= 1 && step < QUESTIONS.length) {
    const fields = ['clientName', 'phoneNumber', 'email', 'zip', 'partRequested', 'make', 'model', 'year', 'trim'];
    data[fields[step - 1]] = userSpeech.trim();

    if (step === QUESTIONS.length - 1) {
      // ALL DONE — SAVE TO YOUR REAL test.leads
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
            text: `AI Voice Lead - Part: ${data.partRequested}, Vehicle: ${data.make} ${data.model} ${data.year}`,
            addedBy: "AI Voice Agent"
          }],
          createdBy: false
        });
        console.log("NEW LEAD SAVED → test.leads");
        response = "Thank you so much! All your details have been recorded. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
      } catch (err) {
        console.error("Save failed:", err);
        response = "Thank you! We have your request and will call you back soon.";
      }
    } else {
      response = QUESTIONS[step];
      step++;
    }
  }

  // Save AI response to history
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
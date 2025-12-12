// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/services/tts.js';
import { askLlama } from '../services/groq.js';

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  const customerPhone = req.body.From;

  updateSession(callSid, {
    phoneNumber: customerPhone,
    step: 'greeting',
    data: {}
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  gather.say({ voice: 'Polly.Joanna' }, 
    "Hello and welcome to Firstused Autoparts! I'm your virtual assistant. How may I assist you with your vehicle today?"
  );

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  const step = session.step || 'greeting';
  const data = session.data || {};

  let aiResponse = "";
  let nextStep = step;

  // AI BRAIN — smart & professional
  const prompt = `
You are a polite, professional auto parts salesperson.
Rules:
- NEVER mention price or warranty — say: "Our representative will contact you with exact pricing and warranty details."
- Ask only ONE question at a time.
- Be natural and friendly.

Current step: ${step}
Customer said: "${userSpeech}"

Collected so far: ${JSON.stringify(data)}

Reply with the next question only:
`;

  aiResponse = await askLlama(prompt);

  // Update session based on step
  switch (step) {
    case 'greeting':
      data.partRequested = userSpeech;
      nextStep = 'ask_make';
      break;
    case 'ask_make':
      data.make = userSpeech;
      nextStep = 'ask_model';
      break;
    case 'ask_model':
      data.model = userSpeech;
      nextStep = 'ask_year';
      break;
    case 'ask_year':
      data.year = userSpeech;
      nextStep = 'ask_trim';
      break;
    case 'ask_trim':
      data.trim = userSpeech;
      nextStep = 'ask_name';
      break;
    case 'ask_name':
      data.clientName = userSpeech;
      nextStep = 'ask_email';
      break;
    case 'ask_email':
      data.email = userSpeech.toLowerCase();
      nextStep = 'ask_zip';
      break;
    case 'ask_zip':
      data.zip = userSpeech;
      nextStep = 'confirm';
      break;
  }

  // SAVE TO YOUR REAL test.leads COLLECTION
  if (nextStep === 'confirm') {
    try {
      await Lead.create({
        clientName: data.clientName || "Voice Customer",
        phoneNumber: session.phoneNumber,
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
          addedBy: "AI Assistant",
          createdAt: new Date.now()
        }],
        createdBy: false
      });
      console.log("NEW LEAD SAVED TO test.leads!");
      aiResponse = "Thank you! We have all your details. Our representative will contact you shortly with pricing, warranty, and delivery options. Have a wonderful day!";
    } catch (err) {
      console.error("Save failed:", err);
      aiResponse = "Thank you! We’ve recorded your request. Our team will call you back soon.";
    }
  }

  updateSession(callSid, { step: nextStep, data });

  const twiml = new VoiceResponse();

  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    twiml.play(`data:audio/wav;base64,${audioBuffer.toString('base64')}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
  }

  if (nextStep !== 'confirm') {
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
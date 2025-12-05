// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import Reservation from '../models/Reservation.js';  // ← Saves to your real crm database

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  // Initialize session
  updateSession(callSid, { 
    history: [],
    partRequested: null,
    addressCollected: false
  });

  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    profanityFilter: false,
  });

  gather.say(
    { voice: 'alice', language: 'en-US' },
    'Hello! Welcome to Firstused Autoparts. How can I help you today?'
  );

  twiml.say('I didn\'t hear anything. Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;
  const customerPhone = req.body.From;  // Real caller number

  console.log('Customer said:', userSpeech);
  console.log('Customer phone:', customerPhone);

  const session = getSession(callSid);

  let aiResponse = "";

  // Step 1: Detect part request
  if (!session.partRequested) {
    const lower = userSpeech.toLowerCase();
    if (lower.includes('brake') || lower.includes('pad') || lower.includes('battery') || lower.includes('headlight') || lower.includes('filter')) {
      session.partRequested = userSpeech;
      aiResponse = `Got it! You want ${userSpeech}. Please tell me your full name and complete shipping address with pincode so I can reserve it for you.`;
    } else {
      aiResponse = "I understand you need auto parts. Please tell me which part you are looking for.";
    }
  }
  // Step 2: Collect address and SAVE TO YOUR REAL CRM DATABASE
  else if (!session.addressCollected) {
    session.addressCollected = true;

    // SAVE TO YOUR REAL crm.reservations collection
    try {
      await Reservation.create({
        callSid,
        customerPhone,
        partRequested: session.partRequested,
        shippingAddress: userSpeech,
        status: 'reserved',
        reservedAt: new Date()
      });
      console.log("SUCCESS: Order saved to crm.reservations collection!");
    } catch (err) {
      console.error("DB Save Failed:", err);
    }

    aiResponse = `Thank you! I've successfully reserved ${session.partRequested} for you.
    Delivery address: ${userSpeech}
    Your order is confirmed! We will contact you soon. Have a great day!`;
  }

  const twiml = new VoiceResponse();

  // Use your beautiful Piper TTS
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
  }

  // End call after order confirmation
  if (session.addressCollected) {
    twiml.hangup();
  } else {
    const gather = twiml.gather({
      input: 'speech',
      action: '/api/voice/speech',
      method: 'POST',
      speechTimeout: 'auto',
    });
  }

  res.type('text/xml').send(twiml.toString());
};
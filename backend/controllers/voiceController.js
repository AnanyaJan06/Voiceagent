// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';  // ← AI BRAIN
import Reservation from '../models/Reservation.js';  // ← Saves to your crm DB

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  updateSession(callSid, { history: [] });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  gather.say('Hello! Welcome to Firstused Autoparts. How can I help you today?');
  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;
  const customerPhone = req.body.From;

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  const history = session.history || [];
  history.push({ role: "user", content: userSpeech });

  // Build conversation for AI
  const conversation = history
    .map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
    .join('\n');

  // ASK THE AI BRAIN (Groq + Llama 3)
  const aiResponse = await askLlama(conversation);

  console.log('AI replied:', aiResponse);  // ← THIS LOG WILL APPEAR AGAIN

  history.push({ role: "assistant", content: aiResponse });
  updateSession(callSid, { history });

  const twiml = new VoiceResponse();

  // Use Piper TTS (beautiful voice)
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
  }

  // If customer gave address → save to your real crm database
  if (userSpeech.toLowerCase().includes('my address') || 
      userSpeech.match(/\d{6}/) ||  // detects pincode
      session.waitingForAddress) {
    try {
      await Reservation.create({
        callSid,
        customerPhone,
        partRequested: session.lastPart || "unknown",
        shippingAddress: userSpeech,
        status: 'reserved'
      });
      console.log("REAL ORDER SAVED in crm.reservations!");
    } catch (err) {
      console.error("DB Error:", err);
    }
  }

  // Keep listening
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  res.type('text/xml').send(twiml.toString());
};
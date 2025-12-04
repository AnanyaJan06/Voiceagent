// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';  // AI BRAIN (fixed version)

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  // Initialize session
  updateSession(callSid, { history: [] });

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

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  const history = session.history || [];

  // Add customer message
  history.push({ role: "user", content: userSpeech });

  // Build clean conversation text
  const conversationText = history
    .map(msg => (msg.role === "user" ? "Customer" : "Assistant") + ": " + msg.content)
    .join("\n");

  // ASK THE AI BRAIN (with strong system rules)
  const aiResponse = await askLlama(conversationText);

  // Save AI reply
  history.push({ role: "assistant", content: aiResponse });
  updateSession(callSid, { history });

  console.log('AI replied:', aiResponse);

  const twiml = new VoiceResponse();

  // Try to use your Piper TTS
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    // Fallback to Twilio Polly (sounds great too)
    twiml.say({ voice: 'Polly.Joanna', language: 'en-US' }, aiResponse);
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
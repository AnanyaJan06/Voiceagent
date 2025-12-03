// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';  // <-- AI BRAIN

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  // Initialize session with empty conversation history
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

  // Fallback if no speech detected
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

  // Add user message to history
  history.push({ role: "user", content: userSpeech });

  // Build prompt with full conversation
  const conversationSoFar = history
    .map(msg => `${msg.role === "user" ? "Customer" : "Assistant"}: ${msg.content}`)
    .join('\n');

  // ASK LLAMA 3 (THE AI BRAIN)
  const aiResponse = await askLlama(`
You are a friendly and professional auto parts salesperson at Firstused Autoparts.
Speak naturally, be helpful, and keep responses short (1-2 sentences max).
Only ask one question at a time.

Conversation so far:
${conversationSoFar}

Reply to the customer:`);

  // Save AI response
  history.push({ role: "assistant", content: aiResponse });
  updateSession(callSid, { history });

  console.log('AI replied:', aiResponse);

  const twiml = new VoiceResponse();

  // Use Piper TTS (your beautiful voice)
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    // Fallback to Twilio voice if TTS fails
    twiml.say({ voice: 'Polly.Joanna', language: 'en-US' }, aiResponse);
  }

  // Keep listening for next message
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });

  res.type('text/xml').send(twiml.toString());
};
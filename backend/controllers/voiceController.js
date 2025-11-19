import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;
import { getSession } from '../utils/state.js';

export const handleIncomingCall = (req, res) => {
  const twiml = new VoiceResponse();

  twiml.start().stream({
    url: 'ws://voiceagent-m4a0.onrender.com/media-stream',
    track: 'inbound'
  });

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

  twiml.say('I didn’t catch that. Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim().toLowerCase();
  console.log('Twilio STT (fallback):', userSpeech);

  const twiml = new VoiceResponse();
  twiml.say('I’m listening with AI...');
  twiml.redirect('/api/voice/incoming');
  res.type('text/xml').send(twiml.toString());
};
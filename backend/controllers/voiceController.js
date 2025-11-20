import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;
import { getSession , updateSession} from '../utils/state.js';

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
  const callSid = req.body.CallSid;
  const session = getSession(callSid);

  console.log('Twilio STT (fallback):', userSpeech);

  const twiml = new VoiceResponse();

  // Detect part type if we don't have one yet
  if (!session.partType) {
    if (userSpeech.includes('brake') || userSpeech.includes('pad')) {
      updateSession(callSid, { partType: 'brake pads', step: 'vehicle' });
      twiml.say('Got it — you need brake pads. What’s the make, model, and year of your vehicle?');
    } else if (userSpeech.includes('battery')) {
      updateSession(callSid, { partType: 'battery', step: 'vehicle' });
      twiml.say('Got it — you need a battery. What’s the make, model, and year of your vehicle?');
    } else {
      twiml.say('I understand you need auto parts. Please tell me what part you are looking for.');
    }
  }
  // We already know the part — now waiting for vehicle
  else if (session.step === 'vehicle') {
    updateSession(callSid, { vehicle: userSpeech, step: 'confirm' });
    twiml.say(`Perfect. Let me check ${session.partType} for ${userSpeech}...`);
    // Here will come RAG/DB lookup later
    twiml.say('We have it in stock. Would you like to place an order?');
  }
  // Future steps (confirm, order, etc.)
  else {
    twiml.say('Thank you for calling Firstused Autoparts. Goodbye!');
    twiml.hangup();
  }

  // Keep the loop alive
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });
  gather.say('Go ahead, I’m listening.');

  res.type('text/xml').send(twiml.toString());
};
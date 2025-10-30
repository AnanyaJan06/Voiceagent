import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;
import { getSession, updateSession } from '../utils/state.js';

export const handleIncomingCall = (req, res) => {
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    profanityFilter: false,
  });

  gather.say(
    { voice: 'alice' },
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

  console.log('Customer said:', userSpeech);

  const twiml = new VoiceResponse();

  // Step 1: Detect part type
  if (!session.partType) {
    if (userSpeech.includes('brake') || userSpeech.includes('pad')) {
      updateSession(callSid, { partType: 'brake pads', step: 'vehicle' });
      twiml.say('Got it — you need brake pads. What’s the make, model, and year of your vehicle?');
    }
    else if (userSpeech.includes('battery')) {
      updateSession(callSid, { partType: 'battery', step: 'vehicle' });
      twiml.say('Got it — you need a battery. What’s the make, model, and year of your vehicle?');
    }
    else {
      twiml.say('I understand you need auto parts. Please tell me what part you need.');
    }
  }
  // Step 2: Get vehicle
  else if (session.step === 'vehicle') {
    updateSession(callSid, { vehicle: userSpeech, step: 'confirm' });
    twiml.say('Perfect. Let me check...');
    // In next step: RAG lookup
  }

  // Loop
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
  });
  gather.say('Go ahead, I’m listening.');

  twiml.say('Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
};
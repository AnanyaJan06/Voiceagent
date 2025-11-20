import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';

export const handleIncomingCall = async (req, res) => {
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

  twiml.say('Goodbye.');
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim().toLowerCase();
  const callSid = req.body.CallSid;
  const session = getSession(callSid);

  console.log('Customer said:', userSpeech);

  const twiml = new VoiceResponse();

  let responseText = "I'm not sure what you need.";

  if (!session.partType) {
    if (userSpeech.includes('brake') || userSpeech.includes('pad')) {
      updateSession(callSid, { partType: 'brake pads', step: 'vehicle' });
      responseText = "Got it — you need brake pads. What’s the make, model, and year of your vehicle?";
    } else if (userSpeech.includes('battery')) {
      updateSession(callSid, { partType: 'battery', step: 'vehicle' });
      responseText = "Got it — you need a battery. What’s the make, model, and year of your vehicle?";
    } else {
      responseText = "I understand you need auto parts. Please tell me what part you are looking for.";
    }
  } else if (session.step === 'vehicle') {
    updateSession(callSid, { vehicle: userSpeech, step: 'done' });
    responseText = `Perfect. Let me check ${session.partType} for ${userSpeech}... We have it in stock! Would you like to order?`;
  } else {
    responseText = "Thank you for calling Firstused Autoparts. Goodbye!";
    twiml.hangup();
  }

  // Generate natural voice with Coqui TTS
  const audioBuffer = await synthesizeText(responseText);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play({
      digits: 'wwww' // small pause
    });
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    twiml.say(responseText); // fallback to Twilio voice
  }

  // Continue conversation
  if (session.step !== 'done') {
    const gather = twiml.gather({
      input: 'speech',
      action: '/api/voice/speech',
      method: 'POST',
      speechTimeout: 'auto',
    });
    gather.say('I am listening...');
  }

  res.type('text/xml').send(twiml.toString());
};
// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

// Step 1: Greet and gather speech
export const handleIncomingCall = (req, res) => {
  const twiml = new VoiceResponse(); // Now works!

  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    profanityFilter: false,
    language: 'en-US'
  });

  gather.say({
    voice: 'alice',
    language: 'en-US'
  }, 'Hello! Welcome to AutoParts CRM. How can I help you today?');

  // Fallback
  twiml.say('I didn’t catch that. Goodbye.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
};

// Step 2: Smart response (NO ECHO)
export const handleSpeech = (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim().toLowerCase();
  console.log('Customer said:', userSpeech);

  const twiml = new VoiceResponse();

  if (!userSpeech) {
    twiml.say('Sorry, I didn’t hear anything. Please try again.');
  }
  else if (userSpeech.includes('brake') || userSpeech.includes('pad')) {
    twiml.say('Got it — you need brake pads. What’s the make, model, and year of your vehicle?');
  }
  else if (userSpeech.includes('oil') || userSpeech.includes('filter')) {
    twiml.say('Looking up oil filters. What car do you have?');
  }
  else if (userSpeech.includes('battery') || userSpeech.includes('alternator')) {
    twiml.say('Alright, checking batteries and alternators. Tell me your vehicle details.');
  }
  else {
    twiml.say('I understand you need auto parts. To find the right one, please tell me your car’s make, model, and year.');
  }

  // Loop: Gather more speech
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto'
  });
  gather.say('Go ahead, I’m listening.');

  twiml.say('Taking too long. Goodbye.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
};
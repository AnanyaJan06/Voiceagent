// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;
import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';

const QUESTIONS = [
  "May I have your full name please?",
  "Thank you! Could you please confirm your phone number?",
  " + // We already have it, but asking politely",
    "I have it as [PHONE]. Is that correct? If not, please say the correct number.",
  "Great! What is your email address?",
  "Thank you. What is your zip or pin code?",
  "Perfect. What part are you looking for?",
  "Got it. What is the make of your vehicle? (e.g. Honda, Toyota)",
  "And the model? (e.g. Civic, Corolla)",
  "What year is your vehicle?",
  "Finally, what is the trim or variant? (e.g. LX, EX, Sport)"
];

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  updateSession(callSid, {
    phoneNumber: phone,
    step: 0,
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
    "Hello and welcome to Firstused Autoparts! How may I help you today?"
  );

  res.type('text/xml').send(twiml.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim().toLowerCase();
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  let step = session.step || 0;
  const data = session.data || {};

  let response = "";

  // PRICE_WARRANTY_REPLY = "Our pricing depends on the exact specifications and available options. To give you the correct and best price, our representative will contact you shortly.";
  const WARRANTY_REPLY = "We usually offer 3 to 12 months warranty, depending on the part condition. Our representative will give you the accurate warranty details for you.";

  // Handle price/warranty questions anytime
  if (userSpeech.includes('price') || userSpeech.includes('cost') || userSpeech.includes('how much')) {
    response = PRICE_WARRANTY_REPLY;
  } else if (userSpeech.includes('warranty') || userSpeech.includes('guarantee')) {
    response = WARRANTY_REPLY;
  }
  // Normal flow
  else if (step === 0) {
    // First message — customer says what part they want
    data.partRequested = req.body.SpeechResult.trim();
    response = "Thank you! Our representative will contact you soon with pricing and availability. To proceed, may I have your full name please?";
    step = 1;
  }
  else if (step >= 1 && step < QUESTIONS.length) {
    // Save answer and ask next question
    const fields = ['clientName', 'phoneNumber', 'email', 'zip', 'partRequested', 'make', 'model', 'year', 'trim'];
    data[fields[step - 1]] = req.body.SpeechResult.trim();

    if (step === QUESTIONS.length - 1) {
      // Last question answered — SAVE TO DATABASE
      try {
        await Lead.create({
          clientName: data.clientName || "Voice Customer",
          phoneNumber: data.phoneNumber || phone,
          email: data.email || "noemail@voicelead.com",
          zip: data.zip || "000000",
          partRequested: data.partRequested || "Not specified",
          make: data.make || "Unknown",
          model: data.model || "Unknown",
          year: data.year || "Unknown",
          trim: data.trim || "Not specified",
          status: "Quoted",
          notes: [{
            text: `Voice lead - Part: ${data.partRequested || 'N/A'}, Vehicle: ${data.make || ''} ${data.model || ''} ${data.year || ''}`,
            addedBy: "AI Voice Agent"
          }],
          createdBy: false
        });
        console.log("NEW LEAD SAVED → test.leads");
        response = "Thank you so much! All details recorded. Our representative will call you back shortly with pricing and warranty details. Have a great day!";
      } catch (err) {
        console.error("Save failed:", err);
        response = "Thank you! We have your request and will call you back soon.";
      }
    } else {
      response = QUESTIONS[QUESTIONS[step]];
      step++;
    }
  }

  updateSession(callSid, { step, data });

  const twiml = new VoiceResponse();

  const audio = await synthesizeText(response);
  if (audio) {
    twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
  } else {
    twiml.say(response);
  }

  if (step < QUESTIONS.length) {
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
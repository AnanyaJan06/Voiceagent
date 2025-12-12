// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  updateSession(callSid, {
    step: 'greeting',
    clientName: null,
    phoneNumber: null,
    email: null,
    zip: null,
    partRequested: null,
    make: null,
    model: null,
    year: null,
    trim: null,
    confirmed: false
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    profanityFilter: false,
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
  const lower = userSpeech.toLowerCase();

  const twiml = new VoiceResponse();

  // INTERCEPTION: Price or Warranty questions → answer & continue current step
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    const priceResponse = "Our pricing depends on the exact part condition and availability. To give you the best and accurate price, our representative will contact you shortly. Kindly continue sharing your details."
    const audio = await synthesizeText(priceResponse);
    if (audio) {
      twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
    } else {
      twiml.say(priceResponse);
    }
    // DO NOT change step — continue from where we were
  }

  if (lower.includes('warranty') || lower.includes('guarantee')) {
    const warrantyResponse = "We normally provide 3 to 12 months warranty depending on the part. Our representative will give you the exact details for your part.";
    const audio = await synthesizeText(warrantyResponse);
    if (audio) {
      twiml.play(`data:audio/wav;base64,${audio.toString('base64')}`);
    } else {
      twiml.say(warrantyResponse);
    }
    // Continue current step
  }

  let aiResponse = "";

  // MAIN FLOW — one question at a time
  switch (session.step) {
    case 'greeting':
      aiResponse = "Thank you for calling. May I know your name, please?";
      session.step = 'name';
      break;

    case 'name':
      session.clientName = userSpeech;
      aiResponse = `Thank you, ${userSpeech}. May I have your mobile number so our team can contact you?`;
      session.step = 'mobile';
      break;

    case 'mobile':
      session.phoneNumber = customerPhone; // Already known from Twilio
      const formatted = customerPhone.replace('+91', '').replace(/(\d{5})(\d{5})/, '$1 $2');
      aiResponse = `Just to confirm, your number is ${formatted}. Is that correct?`;
      session.step = 'mobile_confirm';
      break;

    case 'mobile_confirm':
      if (lower.includes('yes') || lower.includes('correct')) {
        aiResponse = "Perfect. May I have your email ID, please?";
        session.step = 'email';
      } else {
        aiResponse = "Sorry about that. Could you please repeat your mobile number?";
        session.step = 'mobile';
      }
      break;

    case 'email':
      session.email = userSpeech.toLowerCase();
      aiResponse = `Got it — ${userSpeech}. If there's any spelling mistake, our team will fix it. Your mobile number is confirmed. Now, may I know your ZIP code?`;
      session.step = 'zip';
      break;

    case 'zip':
      if (lower.includes("don't know") || lower.includes("not sure")) {
        session.zip = "00000";
        aiResponse = "No problem at all. Our representative will take care of it. What part are you looking for?";
      } else {
        session.zip = userSpeech.match(/\d{5,6}/)?.[0] || "00000";
        aiResponse = `Your ZIP code is ${session.zip}, correct?`;
        session.step = 'zip_confirm';
        return; // wait for confirmation
      }
      session.step = 'part';
      break;

    case 'zip_confirm':
      if (lower.includes('yes') || lower.includes('correct')) {
        aiResponse = "Thank you. What part are you looking for?";
      } else {
        aiResponse = "Sorry, please tell me your ZIP code again.";
        session.step = 'zip';
        return;
      }
      session.step = 'part';
      break;

    case 'part':
      session.partRequested = userSpeech;
      aiResponse = "Got it. Now, may I know the make of your vehicle? For example, Honda, Toyota, Hyundai?";
      session.step = 'make';
      break;

    case 'make':
      session.make = userSpeech;
      aiResponse = "Thank you. What is the model name?";
      session.step = 'model';
      break;

    case 'model':
      session.model = userSpeech;
      aiResponse = "Great. What is the year of manufacture?";
      session.step = 'year';
      break;

    case 'year':
      session.year = userSpeech;
      aiResponse = "And finally, do you know the trim or variant? If not, just say I don't know.";
      session.step = 'trim';
      break;

    case 'trim':
      session.trim = lower.includes("don't know") ? "Unknown" : userSpeech;
      // Final confirmation
      aiResponse = `Let me confirm your details:
Name: ${session.clientName}
Mobile: ${session.phoneNumber.replace('+91','').replace(/(\d{5})(\d{5})/, '$1 $2')}
Part: ${session.partRequested}
Vehicle: ${session.make} ${session.model} ${session.year} ${session.trim}
Is everything correct?`;
      session.step = 'final_confirm';
      break;

    case 'final_confirm':
      if (lower.includes('yes') || lower.includes('correct') || lower.includes('ok')) {
        // SAVE TO YOUR REAL test.leads COLLECTION
        try {
          await Lead.create({
            clientName: session.clientName || "Voice Lead",
            phoneNumber: session.phoneNumber,
            email: session.email || "voicelead@firstused.com",
            zip: session.zip,
            partRequested: session.partRequested,
            make: session.make,
            model: session.model,
            year: session.year,
            trim: session.trim,
            status: "Quoted",
            notes: [{
              text: `Voice AI Lead. Full details collected via phone.`,
              addedBy: "AI Voice Agent"
            }],
            createdBy: false
          });
          console.log("REAL LEAD SAVED TO test.leads!");
        } catch (err) {
          console.error("Save error:", err);
        }

        aiResponse = "Thank you! Your details have been saved. Our representative will contact you soon with pricing and availability. Have a wonderful day!";
        session.step = 'end';
      } else {
        aiResponse = "Sorry about that. Which detail would you like to correct?";
        session.step = 'greeting'; // or go back to specific field
      }
      break;
  }

  // Play response
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    twiml.play(`data:audio/wav;base64,${audioBuffer.toString('base64')}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
  }

  if (session.step !== 'end') {
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
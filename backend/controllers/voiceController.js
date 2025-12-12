// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  updateSession(callSid, {
    step: 'greeting',
    clientName: null,
    phoneNumber: null,
    email: null,
    zip: null,
    part: null,
    make: null,
    model: null,
    year: null,
    trim: null,
    leadSaved: false
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
    speechTimeout: 5
  });

  gather.say('Hello! Welcome to Firstused Autoparts. How can I help you today?');
  res.type('text/xml').send(twl.toString());
};

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || '').trim();
  const callSid = req.body.CallSid;
  const customerPhone = req.body.From;

  console.log('Customer said:', userSpeech);

  const session = getSession(callSid);
  const lower = userSpeech.toLowerCase();

  const twiml = new VoiceResponse();

  let response = "";

  // INTERUPTION HANDLING (price / warranty / anything else)
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    response = "Our pricing depends on the exact part condition and availability. To give you the best price, our representative will contact you shortly. Let's continue with your details.";
    // CONTINUE SAME STEP
  } else if (lower.includes('warranty') || lower.includes('guarantee')) {
    response = "We usually provide 3 to 12 months warranty depending on the part. Our representative will give you the exact details. Let's continue with your information.";
    // CONTINUE SAME STEP
  } else {
    // MAIN FLOW - one by one
    switch (session.step) {
      case 'greeting':
        response = "Thank you for calling. May I know your name, please?";
        session.step = 'name';
        break;

      case 'name':
        session.clientName = userSpeech;
        response = `Thank you, ${userSpeech}. May I have your mobile number so our team can contact you?`;
        session.step = 'mobile';
        break;

      case 'mobile':
        session.phoneNumber = customerPhone; // We have it from Twilio
        const formatted = customerPhone.replace('+91', '').replace(/(\d{5})(\d{5})/, '$1 $2');
        response = `Just to confirm, your number is ${formatted}. Is that correct?`;
        session.step = 'mobile_confirm';
        break;

      case 'mobile_confirm':
        if (lower.includes('yes') || lower.includes('correct') || lower.includes('right')) {
          response = "Perfect. May I have your email ID?";
          session.step = 'email';
        } else {
          response = "Sorry, could you please repeat your mobile number?";
          session.step = 'mobile';
        }
        break;

      case 'email':
        session.email = userSpeech.toLowerCase();
        response = `Got it — ${userSpeech}. If there's any spelling mistake, our team will fix it. Your mobile number is confirmed. Now, may I know your ZIP code?`;
        session.step = 'zip';
        break;

      case 'zip':
        if (lower.includes("don't know") || lower.includes("not sure") || lower.includes("no")) {
          session.zip = "00000";
          response = "No problem at all. Our representative will take care of it. What part are you looking for?";
        } else {
          session.zip = userSpeech.match(/\d{5,6}/)?.[0] || "00000";
          response = `Your ZIP code is ${session.zip}, correct?`;
          session.step = 'zip_confirm';
          return; // wait for confirmation
        }
        session.step = 'part';
        break;

      case 'zip_confirm':
        if (lower.includes('yes') || lower.includes('correct')) {
          response = "Great. What part are you looking for?";
        } else {
          response = "Sorry, please tell me your ZIP code again.";
          session.step = 'zip';
          return;
        }
        session.step = 'part';
        break;

      case 'part':
        session.partRequested = userSpeech;
        response = "Thank you. Now, may I know the make of your vehicle? For example, Honda, Toyota, Hyundai?";
        session.step = 'make';
        break;

      case 'make':
        session.make = userSpeech;
        response = "What is the model name?";
        session.step = 'model';
        break;

      case 'model':
        session.model = userSpeech;
        response = "And the year of manufacture?";
        session.step = 'year';
        break;

      case 'year':
        session.year = userSpeech;
        response = "Finally, do you know the trim or variant? If not, just say I don't know.";
        session.step = 'trim';
        break;

      case 'trim':
        session.trim = lower.includes("don't know") ? "Unknown" : userSpeech;

        // FINAL CONFIRMATION
        response = `Let me repeat your details:
Name: ${session.clientName}
Mobile: ${session.phoneNumber.replace('+91','').replace(/(\d{5})(\d{5})/, '$1 $2')}
Part: ${session.partRequested}
Vehicle: ${session.make} ${session.model} ${session.year} ${session.trim}

Is everything correct?`;

        session.step = 'final_confirm';
        break;

      case 'final_confirm':
        if (lower.includes('yes') || lower.includes('correct') || lower.includes('ok')) {
          // SAVE TO YOUR REAL test.leads
          try {
            await Lead.create({
              clientName: session.clientName || "Voice Lead",
              phoneNumber: session.phoneNumber,
              email: session.email || "voice@firstused.com",
              zip: session.zip,
              partRequested: session.partRequested,
              make: session.make,
              model: session.model,
              year: session.year,
              trim: session.trim,
              status: "Quoted",
              notes: [{
                text: `Voice AI Lead. Full details collected via phone.`,
                addedBy: "AI Agent"
              }],
              createdBy: false
            });
            console.log("NEW LEAD SAVED TO test.leads!");
            session.leadSaved = true;
          } catch (e) {
            console.error("DB Save failed:", e);
          }

          response = "Thank you! Your details have been saved. Our team will contact you soon with pricing and availability. Have a great day!";
          session.step = 'end';
        } else {
          response = "Sorry about that. Which detail would you like to correct?";
          session.step = 'name'; // restart flow or go back
        }
        break;

      default:
        response = "How can I help you with auto parts today?"
    }
  }

  // PLAY RESPONSE WITH PIPER TTS
  const audio = await synthesizeText(response);
  if (audio) {
    const base64 = audio.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, response);
  }

  // CONTINUE OR END
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

  res.type('text/xml').send(twl.toString());
};
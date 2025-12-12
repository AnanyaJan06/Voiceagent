// backend/controllers/voiceController.js
import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from '../models/Lead.js';
import { getSession, updateSession } from '../utils/state.js';
import { synthesizeText } from '../services/tts.js';
import { askLlama } from '../services/groq.js';

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  updateSession(callSid, { history: [], leadSaved: false });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto',
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
  const history = session.history || [];
  history.push({ role: "user", content: userSpeech });

  const conversation = history.map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`).join("\n");

  // AI BRAIN — smart replies
  const aiResponse = await askLlama(conversation);

  console.log('AI replied:', aiResponse);

  history.push({ role: "assistant", content: aiResponse });
  updateSession(callSid, { history });

  const twiml = new VoiceResponse();

  // Use Piper TTS
  const audioBuffer = await synthesizeText(aiResponse);
  if (audioBuffer) {
    const base64Audio = audioBuffer.toString('base64');
    twiml.play(`data:audio/wav;base64,${base64Audio}`);
  } else {
    twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
  }

  // SAVE TO YOUR REAL test.leads collection when customer gives address
  if (!session.leadSaved && (userSpeech.toLowerCase().includes('my address') || userSpeech.match(/\d{6}/))) {
    try {
      await Lead.create({
        clientName: "Voice Lead - " + new Date().toLocaleDateString(),
        phoneNumber: customerPhone,
        email: "voicelead@firstused.com",
        zip: userSpeech.match(/\d{6}/)?.[0] || "000000",
        partRequested: session.partRequested || "Unknown part",
        make: "Unknown",
        model: "Unknown",
        year: "Unknown",
        status: "Quoted",
        notes: [{
          text: `AI Voice Agent Lead. Customer said: "${userSpeech}"`,
          addedBy: "AI Assistant",
          createdAt: new Date()
        }],
        createdBy: false
      });
      console.log("NEW LEAD SAVED TO test.leads collection!");
      updateSession(callSid, { leadSaved: true });
    } catch (err) {
      console.error("Failed to save lead:", err);
    }
  }

  const gather = twiml.gather({
    input: 'speech',
    action: '/api/voice/speech',
    method: 'POST',
    speechTimeout: 'auto'
  });

  res.type('text/xml').send(twiml.toString());
};
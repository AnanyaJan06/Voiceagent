import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from "../models/Lead.js";
import { getSession, updateSession } from "../utils/state.js";
import { synthesizeText } from "../services/tts.js";
import { askLlama } from "../services/groq.js";

/* ---------------- QUESTIONS ---------------- */

const QUESTIONS = [
  "May I have your full name please?",
  "Thank you! What is your email address?",
  "Great! What is your zip or pin code?",
  "Perfect. What part are you looking for?",
  "Got it. What is the make of your vehicle?",
  "And the model?",
  "What year is your vehicle?",
  "Finally, what is the trim or variant?"
];

const PRICE_REPLY =
  "Our pricing depends on the exact specifications and available options. To give you the correct and best price, our representative will contact you shortly.";

const WARRANTY_REPLY =
  "We usually offer 3 to 12 months warranty, depending on the part condition. Our representative will give you the accurate warranty details for you.";

/* ---------------- MULTI-SLOT EXTRACTION ---------------- */

async function extractMultiSlotInfo(text) {
  const prompt = `
Extract vehicle and part details from this sentence.

Return ONLY valid JSON with these keys:
{
  "partRequested": "",
  "make": "",
  "model": "",
  "year": "",
  "trim": ""
}

Rules:
- Keep empty string if not mentioned
- Do not explain
- Output JSON only

Sentence: "${text}"
`;
  try {
    const result = await askLlama(prompt);
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/* ---------------- INCOMING CALL ---------------- */

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;
  const phone = req.body.From;

  updateSession(callSid, {
    phoneNumber: phone,
    confirmedPhone: false,
    tempPhone: null,
    step: 0,
    data: {}
  });

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: "/api/voice/speech",
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say(
    { voice: "Polly.Joanna" },
    "Hello! Welcome to Firstused Autoparts. How may I assist you today?"
  );

  res.type("text/xml").send(twiml.toString());
};

/* ---------------- SPEECH HANDLER ---------------- */

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || "").trim();
  const callSid = req.body.CallSid;

  console.log("Customer said:", userSpeech);

  const session = getSession(callSid);
  let step = session.step || 0;
  const data = session.data || {};

  let response = "";
  const lower = userSpeech.toLowerCase();

  /* ---------- PRICE / WARRANTY INTERRUPT ---------- */
  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) {
    response = PRICE_REPLY;
  } else if (lower.includes("warranty") || lower.includes("guarantee")) {
    response = WARRANTY_REPLY;
  }

  /* ---------- SINGLE-STRETCH HANDLING ---------- */
  if (!response && step === 0) {
    const extracted = await extractMultiSlotInfo(userSpeech);

    if (extracted) {
      for (const key of ["partRequested", "make", "model", "year", "trim"]) {
        if (extracted[key]) data[key] = extracted[key];
      }

      if (data.partRequested && data.make && data.model && data.year) {
        response = `Got it — ${data.partRequested} for a ${data.year} ${data.make} ${data.model}. To proceed, could you please tell me your 10-digit mobile number?`;
        step = 1;
      }
    }
  }

  /* ---------- NORMAL FLOW ---------- */

  if (!response && step === 0) {
    data.partRequested = userSpeech;
    response =
      "Thank you! Our representative will contact you soon with pricing and availability. To proceed, could you please tell me your 10-digit mobile number?";
    step = 1;
  }

  /* ---------- PHONE NUMBER EXTRACTION ---------- */
  else if (!response && step === 1 && !session.confirmedPhone) {
    const extracted = await askLlama(`
You are an expert at extracting spoken phone numbers.

Rules:
- double seven = 77
- triple eight = 888
- oh / zero = 0

Customer: "${userSpeech}"
Return ONLY the 10-digit number.
`);
    const cleanPhone = (extracted || "").replace(/\D/g, "").slice(-10);

    if (cleanPhone.length === 10) {
      session.tempPhone = cleanPhone;
      response = `I have your number as ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(
        5
      )}. Is this correct? Please say yes or no.`;
      step = 1.5;
    } else {
      response = "Sorry, I didn't catch your number clearly. Please repeat it slowly.";
    }
  }

  /* ---------- PHONE CONFIRM ---------- */
  else if (!response && step === 1.5) {
    const decision = await askLlama(`
Customer reply: "${userSpeech}"
Is this confirmation? Answer YES or NO only.
`);
    if (decision.trim() === "YES") {
      data.phoneNumber = session.tempPhone;
      session.confirmedPhone = true;
      response = QUESTIONS[0];
      step = 2;
    } else {
      response = "No problem. Please say your 10-digit mobile number again.";
      step = 1;
    }
  }

  /* ---------- DATA COLLECTION ---------- */
  else if (!response && session.confirmedPhone && step >= 2 && step < 2 + QUESTIONS.length) {
    const index = step - 2;
    const fields = [
      "clientName",
      "email",
      "zip",
      "partRequested",
      "make",
      "model",
      "year",
      "trim"
    ];

    const cleanValue = await askLlama(`
Extract only the ${fields[index]} from this sentence.
Return only the clean value.

Sentence: "${userSpeech}"
`);
    data[fields[index]] = cleanValue.trim() || userSpeech.trim();

    if (index === QUESTIONS.length - 1) {
      try {
        await Lead.create({
          clientName: data.clientName || "Voice Customer",
          phoneNumber: data.phoneNumber,
          email: data.email || "noemail@voicelead.com",
          zip: data.zip || "000000",
          partRequested: data.partRequested || "Not specified",
          make: data.make || "Unknown",
          model: data.model || "Unknown",
          year: data.year || "Unknown",
          trim: data.trim || "Not specified",
          status: "Quoted",
          notes: [
            {
              text: `AI Voice Lead - ${data.partRequested}`,
              addedBy: "AI Voice Agent"
            }
          ],
          createdBy: false
        });

        response =
          "Thank you so much! All your details have been recorded. Our representative will call you back shortly with exact pricing and warranty. Have a wonderful day!";
      } catch {
        response = "Thank you! We have your request and will call you back soon.";
      }
    } else {
      response = QUESTIONS[index + 1];
      step++;
    }
  }

  /* ---------- UPDATE SESSION ---------- */
  updateSession(callSid, { step, data });

  /* ---------- TTS + TWIML ---------- */
  const twiml = new VoiceResponse();
  const audio = await synthesizeText(response);

  if (audio) {
    twiml.play(`data:audio/wav;base64,${audio.toString("base64")}`);
  } else {
    twiml.say(response);
  }

  if (step < 2 + QUESTIONS.length) {
    twiml.gather({
      input: "speech",
      action: "/api/voice/speech",
      method: "POST",
      speechTimeout: "auto"
    });
  } else {
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
};

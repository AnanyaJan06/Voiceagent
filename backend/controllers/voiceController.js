import twilio from "twilio";
const { VoiceResponse } = twilio.twiml;

import Lead from "../models/Lead.js";
import { getSession, updateSession } from "../utils/state.js";
import { synthesizeText } from "../services/tts.js";
import { askLlama } from "../services/groq.js";

/* ---------------- CONSTANTS ---------------- */

const PRICE_REPLY =
  "Our pricing depends on the exact specifications and available options. Our representative will contact you with exact pricing.";

const WARRANTY_REPLY =
  "Warranty depends on the part condition and availability. Our representative will share accurate warranty details.";

/* ---------------- HELPERS ---------------- */

// Extract part + vehicle info from one sentence
async function extractVehicleInfo(text) {
  const prompt = `
Extract the following fields from the sentence.
Return ONLY valid JSON.

{
  "partRequested": "",
  "make": "",
  "model": "",
  "year": "",
  "trim": ""
}

Rules:
- Empty string if missing
- No explanation
- JSON only

Sentence: "${text}"
`;
  try {
    return JSON.parse(await askLlama(prompt));
  } catch {
    return null;
  }
}

// Extract phone number
async function extractPhone(text) {
  const prompt = `
Extract the 10-digit mobile number from spoken text.
Rules:
- double seven = 77
- triple eight = 888
- oh / zero = 0
Return ONLY digits.

Sentence: "${text}"
`;
  try {
    return (await askLlama(prompt)).replace(/\D/g, "").slice(-10);
  } catch {
    return "";
  }
}

// Save lead
async function saveLead(data, fallbackPhone) {
  await Lead.create({
    clientName: data.clientName || "Voice Customer",
    phoneNumber: data.phoneNumber || fallbackPhone,
    email: data.email || "noemail@voicelead.com",
    zip: data.zip || "000000",
    partRequested: data.partRequested || "Not specified",
    make: data.make || "Unknown",
    model: data.model || "Unknown",
    year: data.year || "Unknown",
    trim: data.trim || "Not specified",
    status: "Quoted",
    notes: [{
      text: `AI Voice Lead - ${data.partRequested}, ${data.make} ${data.model} ${data.year} ${data.trim}`,
      addedBy: "AI Voice Agent"
    }],
    createdBy: false
  });
}

/* ---------------- INCOMING CALL ---------------- */

export const handleIncomingCall = async (req, res) => {
  const callSid = req.body.CallSid;

  updateSession(callSid, {
    step: "START",
    confirmedPhone: false,
    tempPhone: null,
    data: {}
  });

  const twiml = new VoiceResponse();
  twiml.gather({
    input: "speech",
    action: "/api/voice/speech",
    method: "POST",
    speechTimeout: "auto"
  }).say(
    { voice: "Polly.Joanna" },
    "Hello! Welcome to Firstused Autoparts. How may I assist you today?"
  );

  res.type("text/xml").send(twiml.toString());
};

/* ---------------- SPEECH HANDLER ---------------- */

export const handleSpeech = async (req, res) => {
  const userSpeech = (req.body.SpeechResult || "").trim();
  const callSid = req.body.CallSid;
  const fallbackPhone = req.body.From;

  const session = getSession(callSid);
  const data = session.data;
  let response = "";

  const lower = userSpeech.toLowerCase();

  /* ---- PRICE / WARRANTY INTERRUPT ---- */
  if (lower.includes("price") || lower.includes("cost") || lower.includes("how much")) {
    response = PRICE_REPLY;
  } else if (lower.includes("warranty") || lower.includes("guarantee")) {
    response = WARRANTY_REPLY;
  }

  /* ---- START: single-stretch extraction ---- */
  else if (session.step === "START") {
    const extracted = await extractVehicleInfo(userSpeech);

    if (extracted) {
      Object.assign(data, extracted);
    }

    response = `Got it${data.partRequested ? ` — ${data.partRequested}` : ""}${
      data.year ? ` for ${data.year}` : ""
    }${data.make ? ` ${data.make}` : ""}${data.model ? ` ${data.model}` : ""}. 
    To proceed, may I have your 10-digit mobile number?`;

    session.step = "PHONE";
  }

  /* ---- PHONE CAPTURE ---- */
  else if (session.step === "PHONE" && !session.confirmedPhone) {
    const phone = await extractPhone(userSpeech);

    if (phone.length === 10) {
      session.tempPhone = phone;
      response = `I have your number as ${phone.slice(0, 5)} ${phone.slice(5)}. Is that correct?`;
      session.step = "PHONE_CONFIRM";
    } else {
      response = "Sorry, I didn’t catch that. Please say your 10-digit mobile number again.";
    }
  }

  /* ---- PHONE CONFIRM ---- */
  else if (session.step === "PHONE_CONFIRM") {
    const yesNo = await askLlama(`Reply YES or NO only. User said: "${userSpeech}"`);

    if (yesNo.trim() === "YES") {
      data.phoneNumber = session.tempPhone;
      session.confirmedPhone = true;
      response = "Thank you. May I have your full name please?";
      session.step = "NAME";
    } else {
      response = "No problem. Please say your mobile number again.";
      session.step = "PHONE";
    }
  }

  /* ---- NAME ---- */
  else if (session.step === "NAME") {
    data.clientName = userSpeech;
    response = "Thank you. What is your email address?";
    session.step = "EMAIL";
  }

  /* ---- EMAIL ---- */
  else if (session.step === "EMAIL") {
    data.email = userSpeech.toLowerCase();
    response = "What is your zip or pin code?";
    session.step = "ZIP";
  }

  /* ---- ZIP ---- */
  else if (session.step === "ZIP") {
    data.zip = userSpeech;
    const missing = ["make", "model", "year", "trim"].filter(f => !data[f]);

    if (missing.length > 0) {
      response = `To ensure the correct part, could you please tell me the ${missing.join(" and ")}?`;
      session.step = "VEHICLE";
    } else {
      await saveLead(data, fallbackPhone);
      response = "Thank you! All details are recorded. Our representative will contact you shortly.";
      session.step = "DONE";
    }
  }

  /* ---- VEHICLE DETAILS ---- */
  else if (session.step === "VEHICLE") {
    const extracted = await extractVehicleInfo(userSpeech);
    if (extracted) Object.assign(data, extracted);

    const remaining = ["make", "model", "year", "trim"].filter(f => !data[f]);

    if (remaining.length === 0) {
      await saveLead(data, fallbackPhone);
      response = "Thank you! All details are recorded. Our representative will contact you shortly.";
      session.step = "DONE";
    } else {
      response = `Could you please tell me the ${remaining.join(" and ")}?`;
    }
  }

  updateSession(callSid, session);

  const twiml = new VoiceResponse();
  const audio = await synthesizeText(response);

  audio
    ? twiml.play(`data:audio/wav;base64,${audio.toString("base64")}`)
    : twiml.say(response);

  session.step !== "DONE"
    ? twiml.gather({ input: "speech", action: "/api/voice/speech", method: "POST" })
    : twiml.hangup();

  res.type("text/xml").send(twiml.toString());
};

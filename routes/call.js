const express = require('express');
const { twiml } = require('twilio');
const router = express.Router();

router.post('/incoming-call', (req, res) => {
  const response = new twiml.VoiceResponse();
  response.say('Hello! This is your AI assistant. How can I help you today?');
  res.type('text/xml');
  res.send(response.toString());
});

module.exports = router;

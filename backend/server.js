import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import voiceRouter from './routes/voice.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/voice', voiceRouter);

// Health check
app.get('/', (req, res) => {
  res.send('Twilio Voice Webhook (ESM) is LIVE');
});

// Optional: Example of using fetch (no axios)
app.get('/test-fetch', async (req, res) => {
  try {
    const response = await fetch('https://httpbin.org/json');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook: ${getBaseUrl()}/api/voice/incoming`);
});

function getBaseUrl() {
  return process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
}
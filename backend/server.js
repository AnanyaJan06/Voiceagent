import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import voiceRouter from './routes/voice.js';

const app = express();
const server = http.createServer(app);

// WebSocket for Media Streams
const io = new Server(server, {
  path: '/media-stream',  // ← MUST MATCH URL in TwiML
  cors: { origin: '*' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/voice', voiceRouter);

// Health
app.get('/', (req, res) => {
  res.send('Voice Agent – Media Streams ACTIVE');
});

// MEDIA STREAM HANDLER
io.on('connection', (socket) => {
  console.log('Twilio connected to Media Stream:', socket.id);

  socket.on('start', (data) => {
    console.log('STREAM STARTED:', data.streamSid, 'Call:', data.callSid);
  });

  socket.on('media', (data) => {
    const audioBase64 = data.media.payload;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`AUDIO CHUNK: ${audioBuffer.length} bytes`);
    // → Next step: Send to Whisper
  });

  socket.on('stop', () => {
    console.log('STREAM STOPPED');
  });

  socket.on('disconnect', () => {
    console.log('Twilio disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server LIVE on port ${PORT}`);
  console.log(`Webhook: https://voiceagent-m4a0.onrender.com/api/voice/incoming`);
  console.log(`Media Stream: wss://voiceagent-m4a0.onrender.com/media-stream`);
});  
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import voiceRouter from './routes/voice.js';
import { transcribeAudio } from './services/stt.js';
import { getSession, updateSession } from './utils/state.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/media-stream',
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/voice', voiceRouter);

app.get('/', (req, res) => res.send('Voice Agent – Media Streams ACTIVE'));

io.on('connection', (socket) => {
  console.log('Twilio Media Stream connected:', socket.id);

  socket.on('start', (data) => {
    console.log(`STREAM STARTED: ${data.streamSid} Call: ${data.callSid}`);
    getSession(data.callSid);
  });

  socket.on('media', async (data) => {
    const audioBase64 = data.media.payload;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`AUDIO CHUNK: ${audioBuffer.length} bytes`);

    try {
      const text = await transcribeAudio(audioBase64);
      if (text) {
        console.log(`Whisper transcribed: ${text}`);
        updateSession(data.callSid, { lastText: text });
      }
    } catch (error) {
      console.error('Whisper transcription error:', error.message);
    }
  });

  socket.on('stop', () => console.log('STREAM STOPPED'));
  socket.on('disconnect', () => console.log('Twilio disconnected'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server LIVE on port ${PORT}`);
  console.log(`Webhook: https://voiceagent-m4a0.onrender.com/api/voice/incoming`);
  console.log(`Media Stream: wss://voiceagent-m4a0.onrender.com/media-stream`);
});
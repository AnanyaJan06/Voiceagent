import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import voiceRouter, { setMediaHandler } from './routes/voice.js';
import { setupMediaStream } from './sockets/mediaStream.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/voice', voiceRouter);

// Setup media stream
setMediaHandler(setupMediaStream(io));

// Health
app.get('/', (req, res) => {
  res.send('Voice Agent CRM – Media Streams Ready');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/voice/incoming`);
});
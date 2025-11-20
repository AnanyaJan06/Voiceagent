import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import voiceRouter from './routes/voice.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/voice', voiceRouter);

app.get('/', (req, res) => res.send('Voice Agent LIVE - Twilio STT + Coqui TTS'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server LIVE on port ${PORT}`);
  console.log(`Webhook: https://voiceagent-m4a0.onrender.com/api/voice/incoming`);
});
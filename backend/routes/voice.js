import express from 'express';
import { handleIncomingCall, handleSpeech } from '../controllers/voiceController.js';

const router = express.Router();

router.post('/incoming', handleIncomingCall);
router.post('/speech', handleSpeech);

export default router;
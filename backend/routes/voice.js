import express from 'express';
import { handleIncomingCall, handleSpeech } from '../controllers/voiceController.js';
import { setupMediaStream } from '../sockets/mediaStream.js';

const router = express.Router();

let mediaHandler;
export const setMediaHandler = (handler) => { mediaHandler = handler; };

router.post('/incoming', handleIncomingCall);
router.post('/speech', handleSpeech);

// Media stream endpoint
router.post('/media', (req, res) => {
  if (mediaHandler) mediaHandler(req, res);
});

export default router;
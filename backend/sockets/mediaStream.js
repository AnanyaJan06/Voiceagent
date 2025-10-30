import { getSession, updateSession } from '../utils/state.js';

export const setupMediaStream = (io) => {
  io.on('connection', (socket) => {
    console.log('WebSocket connected:', socket.id);

    // Twilio sends audio via HTTP POST to /media
    // We forward it to this socket
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  });

  // This will be called from route
  return (req, res) => {
    const { StreamSid, CallSid } = req.body;
    const session = getSession(CallSid);

    console.log(`Media stream started: ${StreamSid} for call ${CallSid}`);

    // Twilio will now POST audio chunks
    res.json({
      streamSid: StreamSid,
      // We'll handle audio in route
    });
  };
};
// import { transcribeAudio } from '../services/stt.js';
// import { getSession, updateSession } from '../utils/state.js';

// export const setupMediaStream = (io) => {
//   io.on('connection', (socket) => {
//     console.log('Twilio Media Stream connected:', socket.id);

//     socket.on('start', (data) => {
//       console.log('Stream started:', data.streamSid);
//       const session = getSession(data.callSid);
//       // Start session
//     });

//     socket.on('media', async (data) => {
//       const audioBase64 = data.media.payload;
//       const audioBuffer = Buffer.from(audioBase64, 'base64');
      
//       console.log(`Audio chunk: ${audioBuffer.length} bytes`);
      
//       // Transcribe with Whisper
//       const text = await transcribeAudio(audioBase64);
//       if (text) {
//         console.log('Whisper transcribed:', text);
        
//         // Update session with transcribed text
//         const session = getSession(data.callSid);
//         // TODO: Process text (next step: Llama)
        
//         // Send text back or trigger response
//       }
//     });

//     socket.on('stop', (data) => {
//       console.log('Stream stopped');
//     });
//   });
// };

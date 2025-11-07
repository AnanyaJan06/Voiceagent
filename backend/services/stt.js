// Send audio chunk to Python Whisper via fetch
export async function transcribeAudio(audioBase64) {
  try {
    const response = await fetch('http://localhost:5001/transcribe', {  // Local dev
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64 })
    });
    
    if (!response.ok) throw new Error('Whisper error');
    
    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error('STT error:', error);
    return '';  // Fallback to Twilio STT
  }
}
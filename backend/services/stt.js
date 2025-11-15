// backend/services/stt.js
export async function transcribeAudio(audioBase64) {
  const STT_URL = process.env.STT_URL || 'http://localhost:5001'; // Local fallback

  try {
    const response = await fetch(`${STT_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64 })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error('STT error:', error.message);
    return ''; // Fallback to Twilio STT
  }
}
export async function transcribeAudio(audioBase64) {
  const STT_URL = process.env.STT_URL || 'http://localhost:5001';

  try {
    const res = await fetch(`${STT_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64 })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`STT error: ${res.status} - ${err}`);
    }

    const data = await res.json();
    return data.text || '';
  } catch (e) {
    console.error('STT error:', e.message);
    return '';
  }
}
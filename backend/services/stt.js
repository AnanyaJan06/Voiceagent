export async function transcribeAudio(audioBase64) {
  const STT_URL = process.env.STT_URL || 'http://localhost:5001';
  console.log('Sending to STT_URL:', STT_URL); // ← ADD THIS

  try {
    const res = await fetch(`${STT_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: audioBase64 })
    });

    console.log('STT response status:', res.status); // ← ADD THIS

    if (!res.ok) {
      const err = await res.text();
      console.error('STT failed:', err);
      return '';
    }

    const data = await res.json();
    console.log('STT raw response:', data); // ← ADD THIS
    return data.text || '';
  } catch (e) {
    console.error('STT fetch error:', e.message);
    return '';
  }
}
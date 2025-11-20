export async function synthesizeText(text) {
  const TTS_URL = process.env.TTS_URL || 'http://localhost:5002';

  try {
    const res = await fetch(`${TTS_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error('TTS error:', e.message);
    return null;
  }
}
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import wave

app = Flask(__name__)
CORS(app)

VOICE_PATH = os.path.join(os.path.dirname(__file__), "voices", "en_US-libritts-high.onnx")
voice = PiperVoice.load(VOICE_PATH)

@app.route('/')
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        text = request.get_json().get("text", "").strip()
        if not text:
            return jsonify({"error": "No text"}), 400

        # Generate raw PCM
        import io
        pcm_buffer = io.BytesIO()
        voice.synthesize(text, pcm_buffer)
        pcm_buffer.seek(0)
        pcm_data = pcm_buffer.read()

        # Wrap in WAV header
        import tempfile
        final_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        with wave.open(final_wav.name, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(22050)
            wav.writeframes(pcm_data)

        return send_file(
            final_wav.name,
            mimetype="audio/wav",
            as_attachment=True,
            download_name="response.wav"
        )

    except Exception as e:
        print("TTS ERROR:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Piper TTS server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
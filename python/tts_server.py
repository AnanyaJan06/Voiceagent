from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import io
import wave

app = Flask(__name__)
CORS(app)

# Load Piper voice model
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
            return jsonify({"error": "No text provided"}), 400

        # 1️⃣ Generate raw PCM in memory
        pcm_buffer = io.BytesIO()
        voice.synthesize(text, pcm_buffer)
        pcm_data = pcm_buffer.getvalue()

        # 2️⃣ Wrap raw PCM in proper WAV
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)      # 16-bit
            wav_file.setframerate(22050)  # libritts-high sample rate
            wav_file.writeframes(pcm_data)

        wav_buffer.seek(0)

        return send_file(
            wav_buffer,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='response.wav'
        )

    except Exception as e:
        print("TTS ERROR:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Piper TTS server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)

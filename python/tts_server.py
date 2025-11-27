from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import io
import wave
import traceback

app = Flask(__name__)
CORS(app)

# Load Piper voice
VOICE_PATH = os.path.join(os.path.dirname(__file__), "voices", "en_US-libritts-high.onnx")
voice = PiperVoice.load(VOICE_PATH)

@app.route('/')
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        data = request.get_json(force=True)
        text = data.get("text", "").strip()

        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Piper writes raw PCM to a BytesIO buffer
        pcm_buffer = io.BytesIO()
        try:
            voice.synthesize(text, pcm_buffer)
        except Exception as e:
            print("Piper synthesis error:", e)
            traceback.print_exc()
            return jsonify({"error": f"Piper synthesis failed: {str(e)}"}), 500

        pcm_buffer.seek(0)
        pcm_data = pcm_buffer.read()

        if not pcm_data:
            return jsonify({"error": "No PCM data generated"}), 500

        # Wrap PCM in WAV
        wav_buffer = io.BytesIO()
        try:
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(22050)
                wav_file.writeframes(pcm_data)
        except Exception as e:
            print("WAV conversion error:", e)
            traceback.print_exc()
            return jsonify({"error": f"WAV conversion failed: {str(e)}"}), 500

        wav_buffer.seek(0)
        return send_file(
            wav_buffer,
            mimetype="audio/wav",
            as_attachment=True,
            download_name="response.wav"
        )

    except Exception as e:
        print("TTS server error:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Piper TTS server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)

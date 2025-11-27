from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import tempfile
import wave

app = Flask(__name__)
CORS(app)

# Load voice model
VOICE_PATH = os.path.join(os.path.dirname(__file__), "voices", "en_US-libritts-high.onnx")
voice = PiperVoice.load(VOICE_PATH)

@app.route('/')
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        data = request.get_json()
        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": "No text"}), 400

        # Create proper WAV file that Piper can write to
        tmp_path = os.path.join(tempfile.gettempdir(), f"piper_{os.urandom(4).hex()}.wav")
        
        # Piper needs a file-like object with .write()
        with open(tmp_path, "wb") as wav_file:
            # This is the correct way — Piper writes raw PCM, we wrap in WAV header
            voice.synthesize(text, wav_file)

        # Convert raw PCM to proper WAV (Piper outputs raw PCM)
        with open(tmp_path, "rb") as f:
            pcm_data = f.read()

        # Create final WAV with header
        final_path = tmp_path + "_final.wav"
        with wave.open(final_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)    # 16-bit
            wav.setframerate(22050)  # libritts-high uses 22050 Hz
            wav.writeframes(pcm_data)

        return send_file(final_path, mimetype="audio/wav", as_attachment=True, download_name="response.wav")

    except Exception as e:
        print("TTS ERROR:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Piper TTS server starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
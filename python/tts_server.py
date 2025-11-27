from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import tempfile
import uuid

app = Flask(__name__)
CORS(app)

VOICE_PATH = os.path.join(os.path.dirname(__file__), "voices", "en_US-libritts-high.onnx")
voice = PiperVoice.load(VOICE_PATH)

@app.route('/')
def health():
    return jsonify({"status": "ok", "voice": "en_US-libritts-high"}), 200

@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        if not request.is_json:
            return jsonify({"error": "JSON required"}), 400
            
        text = request.get_json().get('text', '').strip()
        if not text:
            return jsonify({"error": "No text"}), 400

        # Generate unique filename to avoid conflicts
        tmp_filename = os.path.join(tempfile.gettempdir(), f"piper_{uuid.uuid4().hex}.wav")
        
        # Write directly — no file handle issues
        with open(tmp_filename, "wb") as f:
            voice.synthesize(text, f)

        return send_file(tmp_filename, mimetype="audio/wav", as_attachment=True, download_name="response.wav")
        
    except Exception as e:
        print(f"TTS ERROR: {e}")  # This will show in Render logs
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Starting Piper TTS server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
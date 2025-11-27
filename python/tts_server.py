from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from piper import PiperVoice
import os
import tempfile

app = Flask(__name__)
CORS(app)

# Load Piper voice
VOICE_PATH = os.path.join(os.path.dirname(__file__), "voices", "en_US-libritts-high.onnx")
voice = PiperVoice.load(VOICE_PATH)

@app.route('/')
def health():
    return jsonify({"status": "ok", "voice": "en_US-libritts-high"}), 200

@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        # SAFELY get JSON
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
            
        data = request.get_json()
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Generate WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            voice.synthesize(text, f)
            f.close()
            return send_file(f.name, mimetype="audio/wav", as_attachment=True, download_name="response.wav")
            
    except Exception as e:
        print(f"TTS Error: {e}")  # This will show in Render logs
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    print(f"Starting Piper TTS server (libritts-high) on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from TTS.api import TTS
import tempfile
import os

app = Flask(__name__)
CORS(app)

# Load Coqui TTS model - natural female voice
# First run will download ~200MB model — normal!
tts = TTS("tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)

# Health check so Render stops complaining
@app.route('/')
def health():
    return jsonify({"status": "ok", "message": "TTS server is alive and ready"}), 200

# Main endpoint
@app.route('/synthesize', methods=['POST'])
def synthesize():
    try:
        data = request.get_json(force=True)
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Generate WAV file
        tmp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        tts.tts_to_file(text=text, file_path=tmp_file.name)
        
        return send_file(tmp_file.name, mimetype='audio/wav')
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Render injects $PORT — MUST use it
    port = int(os.getenv('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
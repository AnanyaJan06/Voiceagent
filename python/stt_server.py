from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import base64
import io
import wave
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Load Whisper model (small = fast, accurate for English)
model = WhisperModel("small", device="cpu", compute_type="int8")  # Use "cuda" if GPU

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        # Get base64 audio from Node.js
        data = request.json
        audio_base64 = data['audio']
        
        # Decode to WAV bytes
        audio_bytes = base64.b64decode(audio_base64)
        audio_io = io.BytesIO(audio_bytes)
        
        # Transcribe
        segments, info = model.transcribe(audio_io, beam_size=5, language='en')
        text = ' '.join(seg.text.strip() for seg in segments).strip()
        
        return jsonify({
            'text': text,
            'duration': info.duration
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
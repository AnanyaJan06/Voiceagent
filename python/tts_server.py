from flask import Flask, request, send_file
from flask_cors import CORS
from TTS.api import TTS
import tempfile, os

app = Flask(__name__)
CORS(app)

# Natural female voice
tts = TTS("tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)

@app.route('/synthesize', methods=['POST'])
def synthesize():
    text = request.json['text']
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tts.tts_to_file(text=text, file_path=tmp.name)
    return send_file(tmp.name, mimetype='audio/wav')

if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
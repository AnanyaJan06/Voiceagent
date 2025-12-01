# from flask import Flask, request, jsonify
# from flask_cors import CORS
# from faster_whisper import WhisperModel
# import base64, io, os
# from dotenv import load_dotenv

# load_dotenv()
# app = Flask(__name__)
# CORS(app)

# # tiny.en = 75MB → fits in 512MB RAM
# model = WhisperModel("tiny.en", device="cpu", compute_type="int8")

# @app.route('/transcribe', methods=['POST'])
# def transcribe():
#     try:
#         audio_base64 = request.json['audio']
#         audio_bytes = base64.b64decode(audio_base64)
#         audio_io = io.BytesIO(audio_bytes)

#         segments, _ = model.transcribe(audio_io, beam_size=5, language='en')
#         text = ' '.join(seg.text.strip() for seg in segments).strip()

#         return jsonify({'text': text})
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500

# if __name__ == '__main__':
#     port = int(os.getenv('PORT', 10000))
#     app.run(host='0.0.0.0', port=port, debug=False)
import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))


class DependencyImportTest(unittest.TestCase):
    def test_flask(self):
        from flask import Flask
        app = Flask(__name__)
        self.assertIsNotNone(app)

    def test_flask_cors(self):
        from flask import Flask
        from flask_cors import CORS
        app = Flask(__name__)
        cors = CORS(app, resources={r"/api/*": {"origins": ["https://talkwithtalky.org"]}})
        self.assertIsNotNone(cors)

    def test_flask_socketio(self):
        from flask import Flask
        from flask_socketio import SocketIO
        app = Flask(__name__)
        socketio = SocketIO(app)
        self.assertIsNotNone(socketio)

    def test_werkzeug(self):
        from importlib.metadata import version
        ver = version("werkzeug")
        self.assertIsNotNone(ver)

    def test_torch(self):
        import torch
        t = torch.tensor([1.0, 2.0, 3.0])
        self.assertEqual(t.shape[0], 3)

    def test_torchaudio(self):
        import torchaudio
        self.assertIsNotNone(torchaudio.__version__)

    def test_numpy(self):
        import numpy as np
        arr = np.array([1, 2, 3])
        self.assertEqual(arr.sum(), 6)

    def test_soundfile(self):
        import soundfile as sf
        import numpy as np
        import tempfile

        data = np.zeros(16000, dtype=np.float32)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            path = f.name
        try:
            sf.write(path, data, 16000)
            read_data, sr = sf.read(path)
            self.assertEqual(sr, 16000)
            self.assertEqual(len(read_data), 16000)
        finally:
            os.unlink(path)

    def test_transformers(self):
        from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
        self.assertIsNotNone(Wav2Vec2Processor)
        self.assertIsNotNone(Wav2Vec2ForCTC)

    def test_gtts(self):
        from gtts import gTTS
        self.assertIsNotNone(gTTS)

    def test_jiwer(self):
        import jiwer
        wer = jiwer.wer("hello world", "hello world")
        self.assertAlmostEqual(wer, 0.0)
        wer_mismatch = jiwer.wer("hello world", "hello")
        self.assertGreater(wer_mismatch, 0.0)

    def test_pydub(self):
        from pydub import AudioSegment
        self.assertIsNotNone(AudioSegment)

    def test_eng_to_ipa(self):
        import eng_to_ipa as ipa
        result = ipa.convert("cat")
        self.assertIsInstance(result, str)
        self.assertGreater(len(result), 0)

    def test_rapidfuzz(self):
        from rapidfuzz import fuzz
        score = fuzz.ratio("hello", "hello")
        self.assertAlmostEqual(score, 100.0)

    def test_pymongo(self):
        import pymongo
        self.assertIsNotNone(pymongo.__version__)

    def test_certifi(self):
        import certifi
        ca_bundle = certifi.where()
        self.assertTrue(os.path.exists(ca_bundle))

    def test_python_jose(self):
        from jose import jwt
        token = jwt.encode({"sub": "test"}, "secret", algorithm="HS256")
        payload = jwt.decode(token, "secret", algorithms=["HS256"])
        self.assertEqual(payload["sub"], "test")

    def test_groq_client_importable(self):
        from groq import Groq
        self.assertIsNotNone(Groq)

    def test_requests(self):
        import requests
        self.assertIsNotNone(requests.__version__)

    def test_python_dotenv(self):
        from dotenv import load_dotenv
        self.assertIsNotNone(load_dotenv)

    @unittest.skipIf(sys.platform == "win32", "gunicorn is unix only")
    def test_gunicorn_importable(self):
        import gunicorn
        self.assertIsNotNone(gunicorn.__version__)


if __name__ == '__main__':
    unittest.main()
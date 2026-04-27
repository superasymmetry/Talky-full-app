import unittest
from unittest import mock
import sys
import os
import tempfile
import io

import soundfile as sf
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'utils')))
from server.main import get_phoneme_scores
from utils import generate_test_sound

class TestPhonemeScore(unittest.TestCase):
    def test_standard_sentence(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'reference.wav'
        # expected_ipa =  ['ð', 'ə', 'k', 'w', 'ɪ', 'k', 'b', 'ʊ', 'n', 'f', 'ɑ', 'k', 's', 'ʤ', 'ə', 'm', 'p', 's', 'ʊ', 'v', 'ə', 'ð', 'ə', 'l', 'ɪ', 'z', 'i', 'd', 'g']
        expected_sentence = "the quick brown fox jumps over the lazy dog"
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score > 70.0, True)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['word'], 'the')
        self.assertEqual(len(res[0]['phonemes']), 5)
        self.assertEqual(res[0]['phonemes'][0]['phoneme'], 'ð')
        self.assertEqual(res[0]['phonemes'][1]['phoneme'], 'ə')
        self.assertEqual(res[0]['phonemes'][2]['phoneme'], 'k')
        self.assertEqual(res[0]['phonemes'][3]['phoneme'], 'w')

    def test_empty_audio(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'empty.wav'
        expected_sentence = ""
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score, 0.0)
        self.assertEqual(len(res), 1)
        self.assertEqual(res, [{'word': '', 'phonemes': []}])

    def test_sentence_doesnt_match(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'reference.wav'
        expected_sentence = "hello world"
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score < 70.0, True)
        self.assertEqual(len(res), 2)
        self.assertEqual(res[0]['word'], 'hello')
        self.assertEqual(res[1]['word'], 'world')
    
    def test_sentence_missing_words(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'reference.wav'
        expected_sentence = "the quick brown fox jumps over the lazy dog cat hat"
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score < 70.0, True)
        self.assertEqual(len(res), 3)
        self.assertEqual(res[0]['word'], 'the')
        self.assertEqual(res[1]['word'], 'quick')
        self.assertEqual(res[2]['word'], 'brown')
    
    def test_sentence_mispronounced_words(self):
        from phoneme_eval import get_phoneme_scores
        generate_test_sound("the kwik bwown fox jumps ovur the lazy dug", "mispronounced.wav")
        audio_path = 'mispronounced.wav'
        expected_sentence = "the quick brown fox jumps over the lazy dog"
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score < 70.0, True)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['word'], 'the')
        self.assertEqual(len(res[0]['phonemes']), 5)
        self.assertEqual(res[0]['phonemes'][0]['phoneme'], 't')
        self.assertEqual(res[0]['phonemes'][1]['phoneme'], 'ə')
        self.assertEqual(res[0]['phonemes'][2]['phoneme'], 'k')
        self.assertEqual(res[0]['phonemes'][3]['phoneme'], 'w')
    
    def test_same_words(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'same_words.wav'
        expected_sentence = "the the the the the"
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        self.assertEqual(avg_score > 70.0, True)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['word'], 'the')
        self.assertEqual(len(res[0]['phonemes']), 5)
        for phoneme_info in res[0]['phonemes']:
            self.assertEqual(phoneme_info['phoneme'], 'ð')

    def test_sentence_with_period(self):
        from phoneme_eval import get_phoneme_scores
        audio_path = 'reference.wav'
        expected_sentence = "the quick brown fox jumps over the lazy dog."
        res, avg_score = get_phoneme_scores(audio_path, expected_sentence)
        res1, avg_score1 = get_phoneme_scores(audio_path, expected_sentence.rstrip('.'))
        self.assertEqual(avg_score, avg_score1)
        self.assertEqual(res, res1)
        self.assertEqual(avg_score > 70.0, True)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['word'], 'the')
        self.assertEqual(len(res[0]['phonemes']), 5)
        self.assertEqual(res[0]['phonemes'][0]['phoneme'], 'ð')
        self.assertEqual(res[0]['phonemes'][1]['phoneme'], 'ə')
        self.assertEqual(res[0]['phonemes'][2]['phoneme'], 'k')
        self.assertEqual(res[0]['phonemes'][3]['phoneme'], 'w')

    def test_with_dataset(self):
        import phoneme_eval
        from datasets import Audio, load_dataset

        ds = load_dataset("hf-audio/open-asr-leaderboard", "ami", split="test", streaming=True)
        # Avoid torchcodec dependency by keeping audio as raw bytes.
        ds = ds.cast_column("audio", Audio(decode=False))
        small = list(ds.take(10))
        scores = []
        for item in small:
            expected_sentence = item.get('text')
            if not expected_sentence:
                continue

            audio = item['audio']
            audio_bytes = audio.get('bytes')
            audio_path = audio.get('path')
            if not audio_bytes and not audio_path:
                continue

            if audio_bytes:
                audio_array, sampling_rate = sf.read(io.BytesIO(audio_bytes))
            else:
                audio_array, sampling_rate = sf.read(audio_path)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            try:
                sf.write(tmp_path, audio_array, sampling_rate)
                _, avg_score = phoneme_eval.get_phoneme_scores(tmp_path, expected_sentence)
                scores.append(avg_score)
            finally:
                os.remove(tmp_path)

        if not scores:
            self.skipTest("No samples with text available in this split.")

        self.assertEqual(len(scores) > 0, True)
        for score in scores:
            self.assertGreater(score, 70.0)


if __name__ == '__main__':
    unittest.main()
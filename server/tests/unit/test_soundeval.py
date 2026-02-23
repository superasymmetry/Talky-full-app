import unittest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

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

if __name__ == '__main__':
    unittest.main()
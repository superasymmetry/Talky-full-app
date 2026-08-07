"""Alignment/scoring unit tests for stream_decode_logits.

These drive the aligner with hand-built CTC logits and a fake tokenizer, so no
model download or audio is involved.
"""

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from stream_decode_util import stream_decode_logits  # noqa: E402

# Two trailing filler tokens keep the "top 3 logits" leniency check from
# accidentally crediting a real phoneme: every non-decoded logit is equal, so
# argsort puts the highest-numbered ids in the top 3, and those are the fillers.
VOCAB = {
    "<pad>": 0, "k": 1, "ə": 2, "l": 3, "ɝ": 4, "r": 5,
    "d": 6, "h": 7, "z": 8, "_f1": 9, "_f2": 10,
}


class FakeTokenizer:
    pad_token_id = 0
    all_special_ids = [0]

    def get_vocab(self):
        return dict(VOCAB)

    def convert_ids_to_tokens(self, ids):
        rev = {v: k for k, v in VOCAB.items()}
        return [rev[i] for i in ids]

    def convert_tokens_to_ids(self, token):
        return VOCAB[token]


def logits_for(decoded_tokens):
    """One frame per decoded phoneme, each frame peaking at that phoneme."""
    frames = np.full((len(decoded_tokens), len(VOCAB)), -20.0, dtype=np.float32)
    for i, tok in enumerate(decoded_tokens):
        frames[i, VOCAB[tok]] = 10.0
    return frames


def run(reference, decoded):
    return list(stream_decode_logits([logits_for(decoded)], reference, FakeTokenizer()))


class RColoredVowelTest(unittest.TestCase):
    def test_decoded_r_colored_vowel_covers_reference_vowel_plus_r(self):
        """"color" = k ə l ə r, but the model hears k ə l ɝ. The ɝ must credit
        both the ə and the r, not leave the r as a 0.0 omission."""
        events = run(["k", "ə", "l", "ə", "r"], ["k", "ə", "l", "ɝ"])
        self.assertEqual([e["position"] for e in events], [0, 1, 2, 3, 4])
        self.assertEqual([e["score"] for e in events], [1.0] * 5)
        self.assertNotIn("omitted", [e["label"] for e in events])

    def test_reference_r_colored_vowel_covers_decoded_vowel_plus_r(self):
        """The reverse: reference "herd" = h ɝ d decoded as h ə r d. The stray
        r must be absorbed, not matched against (and penalized as) the d."""
        events = run(["h", "ɝ", "d"], ["h", "ə", "r", "d"])
        self.assertEqual([e["position"] for e in events], [0, 1, 2])
        self.assertEqual([e["score"] for e in events], [1.0] * 3)

    def test_stressed_r_colored_vowel_is_equivalent(self):
        """ɚ and ɝ differ only in stress and normalize to the same phoneme."""
        events = run(["h", "ɚ", "d"], ["h", "ɝ", "d"])
        self.assertEqual([e["score"] for e in events], [1.0] * 3)

    def test_merge_requires_a_following_r_in_the_reference(self):
        """Guard: the merge is an r-coloring equivalence, not a licence for one
        decoded vowel to cover any two reference phonemes."""
        events = run(["k", "ə", "l", "ə", "z"], ["k", "ə", "l", "ɝ"])
        credited = [e["position"] for e in events if e["score"] == 1.0]
        self.assertNotIn(4, credited)  # the "z" was never spoken


if __name__ == "__main__":
    unittest.main()

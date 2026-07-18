"""Prosody evaluation, ported from the pronounce-assess library
(https://github.com/superasymmetry/pronounce-assess).

Scores the full utterance once the stream ends: pitch variability (monotony),
rhythm (nPVI over voiced-region durations), boundary tone (rising vs falling
against whether the sentence is a question), and approximate speaking rate.
"""
import threading

import numpy as np
import librosa

_HOP = 512
_warmed = False


def warmup_async():
    """Pre-trigger librosa.pyin's first-call numba JIT (~5 s) in a background
    thread, so evaluate_prosody doesn't stall at the end of a stream.
    Warm up on noise, not silence — the all-unvoiced path compiles far slower.
    """
    global _warmed
    if _warmed:
        return
    _warmed = True

    def _warm():
        # Even resolving the librosa.pyin attribute triggers the slow lazy
        # imports, so everything must happen inside the thread.
        noise = np.random.default_rng().standard_normal(2048, dtype=np.float32)
        librosa.pyin(noise, fmin=75, fmax=300, sr=16000, hop_length=_HOP)

    threading.Thread(target=_warm, daemon=True).start()


def _voiced_regions(voiced_flag):
    regions, in_region, start = [], False, 0
    for i, v in enumerate(voiced_flag):
        if v and not in_region:
            start, in_region = i, True
        elif not v and in_region:
            regions.append((start, i))
            in_region = False
    if in_region:
        regions.append((start, len(voiced_flag)))
    return regions


def evaluate_prosody(audio, text, sr=16000):
    f0, voiced_flag, _ = librosa.pyin(audio, fmin=75, fmax=300, sr=sr, hop_length=_HOP)
    regions = _voiced_regions(voiced_flag)
    voiced_f0 = f0[voiced_flag & np.isfinite(f0)]

    # Monotony: F0 std normalised against ~40 Hz native target
    monotony_score = float(np.clip(np.std(voiced_f0) / 40.0, 0.0, 1.0)) if len(voiced_f0) > 1 else 0.0

    # Rhythm: nPVI over voiced region durations (English native ~50–60)
    durations = [e - s for s, e in regions]
    if len(durations) >= 2:
        npvi = 100 * float(np.mean([abs(a - b) / ((a + b) / 2) for a, b in zip(durations, durations[1:]) if a + b > 0]))
        rhythm_score = float(np.clip(npvi / 50.0, 0.0, 1.0))
    else:
        rhythm_score = None

    # Boundary tone: last 20% vs first 80% of voiced F0
    boundary_score = None
    if len(voiced_f0) >= 10:
        split = max(1, int(len(voiced_f0) * 0.8))
        is_rising = np.mean(voiced_f0[split:]) > np.mean(voiced_f0[:split])
        boundary_score = 1.0 if (is_rising == text.strip().endswith("?")) else 0.0

    return {
        "monotony_score": round(monotony_score, 3),
        "rhythm_score": round(rhythm_score, 3) if rhythm_score is not None else None,
        "boundary_score": boundary_score,
        "speaking_rate": round(len(regions) / (len(audio) / sr), 2),  # approx syllables/sec
    }
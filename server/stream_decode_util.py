import numpy as np

from prosody_eval import evaluate_prosody

_NORM_MAP = [("ɹ", "r"), ("ʌ", "ə"), ("v", "f"), ("ɔ", "ɑ"), ("ʒ", "ʃ"), ("ɚ", "ɝ")]

R_COLORED_VOWEL = "ɝ"


def normalize(phoneme):
    for src, dst in _NORM_MAP:
        phoneme = phoneme.replace(src, dst)
    return phoneme


# exp(min(target_logit - decoded_logit, 0)) is the softmax probability ratio
# P(target)/P(decoded) — exact, since the normalizer cancels out of the ratio.
# CTC-trained logits are sharply peaked, so that ratio collapses to ~0 for
# any gap beyond a few units. Dividing the gap by this temperature before
# exponentiating stretches the falloff back out; higher = more gradual/lenient.
GOP_TEMPERATURE = 5.0


def gop_score(target_logit, decoded_logit, temperature=GOP_TEMPERATURE):
    """Graded Goodness of Pronunciation in (0, 1]: how close the expected
    phoneme's logit was to what the model actually decoded at that frame."""
    if np.isnan(target_logit) or np.isnan(decoded_logit):
        return None
    return float(np.exp(min(target_logit - decoded_logit, 0.0) / temperature))


def stream_decode_logits(logits_chunks, reference_phonemes, tokenizer):
    """
    Core streaming alignment algorithm, operating on precomputed CTC logits.
    Use this when wav2vec2 inference already happened elsewhere (e.g. in the
    browser via transformers.js/onnxruntime-web) and only the logits are
    streamed to the server.

    Args:
        logits_chunks: iterable of float32 numpy arrays of shape (frames, vocab),
                       one per audio chunk, in the model's vocab order.
                       The caller signals end-of-stream by exhausting the iterable.
        reference_phonemes: flat list of IPA phoneme strings to match against, in order.
        tokenizer: Wav2Vec2CTCTokenizer (defines vocab, blank/pad id, special ids).

    Yields:
        dict with keys:
            phoneme  (str)   – the reference phoneme
            position (int)   – its index in reference_phonemes
            label    (str)   – 'correct' | 'mispronounced' | 'omitted' | 'insertion'
            decoded  (str)   – what the model actually decoded (empty string for omitted)
            target_logit (float) – model logit for the expected phoneme at that frame
            decoded_logit (float) – model logit for the decoded phoneme at that frame
            gop      (float|None) – graded Goodness of Pronunciation in (0, 1]
            score    (float) – 1.0 for 'correct' (exact or lenient match),
                               gop for 'mispronounced' when available (else
                               0.5), 0.0 for 'omitted'
    """
    reference_phonemes = [p for p in reference_phonemes if p != "ˈ"]
    pointer = 0
    phoneme2id = tokenizer.get_vocab()
    special = set(tokenizer.all_special_ids)
    # Target logits are read via every vocab id whose normalized form matches,
    # so e.g. a reference "r" also credits the model's "ɹ" logit.
    norm2ids = {}
    for tok, tid in phoneme2id.items():
        if tid not in special and tok not in ("|", " "):
            norm2ids.setdefault(normalize(tok), []).append(tid)
    logit_threshold = 5.0
    lookahead = 3

    for i, logits_np in enumerate(logits_chunks):
        if pointer >= len(reference_phonemes):
            return

        logits_np = np.asarray(logits_np)
        predicted_ids = logits_np.argmax(axis=-1).tolist()
        blank_id = tokenizer.pad_token_id
        collapsed = []
        collapsed_frames = []
        prev = None
        for fi, idx in enumerate(predicted_ids):
            if idx != prev:
                if idx != blank_id:
                    collapsed.append(idx)
                    collapsed_frames.append(fi)
                prev = idx

        tokens = tokenizer.convert_ids_to_tokens(collapsed)
        chunk_phonemes = []
        phoneme_logits = []
        chunk_frames = []
        for fi, idx, t in zip(collapsed_frames, collapsed, tokens):
            if tokenizer.convert_tokens_to_ids(t) not in special and t not in ("|", " "):
                chunk_phonemes.append(normalize(t))
                phoneme_logits.append(logits_np[fi, idx])
                chunk_frames.append(fi)
        # print(f"[chunk {i+1:02d}] {chunk_phonemes}", flush=True)

        # Pre-align: if no chunk phonemes match at the current pointer, scan forward/backward
        # to detect whether the user skipped over some reference phonemes.
        if chunk_phonemes and pointer < len(reference_phonemes):
            current_count = sum(
                1 for di, dp in enumerate(chunk_phonemes)
                if pointer + di < len(reference_phonemes)
                and dp == normalize(reference_phonemes[pointer + di])
            )
            if current_count == 0:
                best_count, best_skip = 0, 0
                back = min(lookahead, pointer)
                fwd  = min(lookahead * 2 + 1, len(reference_phonemes) - pointer)
                for skip in list(range(-back, 0)) + list(range(1, fwd)):
                    count = sum(
                        1 for di, dp in enumerate(chunk_phonemes)
                        if 0 <= pointer + skip + di < len(reference_phonemes)
                        and dp == normalize(reference_phonemes[pointer + skip + di])
                    )
                    if count > best_count:
                        best_count, best_skip = count, skip
                if best_count >= 2:
                    if best_skip > 0:
                        for k in range(best_skip):
                            omitted_ph = reference_phonemes[pointer + k]
                            # print(f"  [omitted] {normalize(omitted_ph)!r}", flush=True)
                            yield {
                                "phoneme": omitted_ph,
                                "position": pointer + k,
                                "label": "omitted",
                                "decoded": "",
                                "target_logit": float("nan"),
                                "decoded_logit": float("nan"),
                                "gop": 0.0,
                                "score": 0.0,
                            }
                    pointer += best_skip

        j = 0
        while j < len(chunk_phonemes):
            fi, p, lv = chunk_frames[j], chunk_phonemes[j], phoneme_logits[j]
            if pointer >= len(reference_phonemes):
                # print(f"  [insertion] {p!r}: {lv:.4f}", flush=True)
                j += 1
                continue
            target_p = normalize(reference_phonemes[pointer])
            target_ids = norm2ids.get(target_p, [])
            target_lv = max((float(logits_np[fi, t]) for t in target_ids),
                            default=float("nan"))
            top3_ids = set(logits_np[fi].argsort()[-3:].tolist())
            target_in_top3 = any(t in top3_ids for t in target_ids)

            # Decoded ɝ standing in for a reference vowel immediately
            # followed by "r" — credit both reference positions from this
            # one frame instead of leaving the "r" as an omission.
            if (p == R_COLORED_VOWEL and target_p != R_COLORED_VOWEL
                    and pointer + 1 < len(reference_phonemes)
                    and normalize(reference_phonemes[pointer + 1]) == "r"):
                for ref_pos in (pointer, pointer + 1):
                    yield {
                        "phoneme": reference_phonemes[ref_pos],
                        "position": ref_pos,
                        "label": "correct",
                        "decoded": p,
                        "target_logit": target_lv,
                        "decoded_logit": float(lv),
                        "gop": 1.0,
                        "score": 1.0,
                    }
                pointer += 2
                j += 1
                continue

            # Reverse: reference ɝ decoded as a split vowel + "r" — credit
            # the reference position once and absorb the following "r"
            # frame instead of matching (and penalizing) it against
            # whatever comes next in the reference.
            if (target_p == R_COLORED_VOWEL and p != R_COLORED_VOWEL
                    and j + 1 < len(chunk_phonemes) and chunk_phonemes[j + 1] == "r"):
                yield {
                    "phoneme": reference_phonemes[pointer],
                    "position": pointer,
                    "label": "correct",
                    "decoded": p,
                    "target_logit": target_lv,
                    "decoded_logit": float(lv),
                    "gop": 1.0,
                    "score": 1.0,
                }
                pointer += 1
                j += 2
                continue

            if p == target_p or (target_ids and target_lv > logit_threshold) or target_in_top3:
                label = "correct"
                pos = pointer
                pointer += 1
            elif target_ids and target_lv > 0:
                next_is_target = j + 1 < len(chunk_phonemes) and chunk_phonemes[j + 1] == target_p
                if next_is_target:
                    label = "insertion"
                    pos = None
                else:
                    label = "mispronounced"
                    pos = pointer
                    pointer += 1
            else:
                # Target logit is ≤ 0 or unknown — check if the reference phoneme was
                # simply omitted and the decoded phoneme matches something ahead.
                skip_to = next(
                    (k for k in range(1, min(lookahead + 1, len(reference_phonemes) - pointer))
                     if p == normalize(reference_phonemes[pointer + k])),
                    None,
                )
                if skip_to is not None:
                    for k in range(skip_to):
                        omitted_ph = reference_phonemes[pointer + k]
                        # print(f"  [omitted] {normalize(omitted_ph)!r}", flush=True)
                        yield {
                            "phoneme": omitted_ph,
                            "position": pointer + k,
                            "label": "omitted",
                            "decoded": "",
                            "target_logit": float("nan"),
                            "decoded_logit": float("nan"),
                            "gop": 0.0,
                            "score": 0.0,
                        }
                    pointer += skip_to
                    label = "correct"
                    pos = pointer
                    # target_lv was read for the phoneme we just marked
                    # omitted; re-read it for the advanced pointer so the
                    # yielded event scores the phoneme it actually matched.
                    target_ids = norm2ids.get(normalize(reference_phonemes[pointer]), [])
                    target_lv = max((float(logits_np[fi, t]) for t in target_ids),
                                    default=float("nan"))
                    pointer += 1
                else:
                    label = "insertion"
                    pos = None
            # print(f"  [{label}] {p!r}: {lv:.4f}  target={target_p!r}: {target_lv:.4f}", flush=True)
            if pos is not None:
                gop = gop_score(target_lv, float(lv))
                # "correct" is reached two ways: an exact argmax match (where
                # target_lv >= lv by construction, so gop is already 1.0), or
                # the lenient top-3/threshold heuristic below, where the
                # decoded phoneme differs from the target and target_lv < lv
                # *by construction* — gop would always be < 1.0 there, quietly
                # undoing the leniency the label is supposed to grant. Keep
                # gop grading for genuine mispronunciations; always give full
                # credit once something has been labeled "correct".
                score = 1.0 if label == "correct" else (gop if gop is not None else 0.5)
                yield {
                    "phoneme": reference_phonemes[pos],
                    "position": pos,
                    "label": label,
                    "decoded": p,
                    "target_logit": target_lv,
                    "decoded_logit": lv,
                    "gop": gop,
                    "score": score,
                }
            j += 1


def prosody_event(audio, text, sample_rate=16000):
    """Wrap evaluate_prosody's scores in the same dict shape as alignment
    events, with label 'prosody', so they flow through the same channel."""
    return {
        "phoneme": None,
        "position": None,
        "label": "prosody",
        "decoded": None,
        "target_logit": float("nan"),
        "decoded_logit": float("nan"),
        "gop": None,
        "score": None,
        **evaluate_prosody(audio, text, sr=sample_rate),
    }


def stream_decode_util(audio_chunks, reference_phonemes, processor, model,
                       device="cpu", sample_rate=16000):
    """
    Server-side inference path: runs wav2vec2 on raw audio chunks, then feeds
    the logits through stream_decode_logits. Kept for clients that stream raw
    PCM instead of precomputed logits.

    Prosody is not scored here — the caller buffers the raw audio and runs
    prosody_event after the alignment result has been sent.

    Args:
        audio_chunks: iterable of float32 numpy arrays at sample_rate Hz.
                      The caller signals end-of-stream by exhausting the iterable.
        reference_phonemes: flat list of IPA phoneme strings to match against, in order.
        processor: Wav2Vec2Processor
        model: Wav2Vec2ForCTC
        device: torch device string (default "cpu")
        sample_rate: audio sample rate in Hz (default 16000)

    Yields:
        same dicts as stream_decode_logits.
    """
    import torch

    def logits_generator():
        for chunk in audio_chunks:
            inputs = processor(chunk, sampling_rate=sample_rate,
                               return_tensors="pt", padding=True).to(device)
            with torch.no_grad():
                logits = model(**inputs).logits
            yield logits[0].cpu().numpy()

    yield from stream_decode_logits(logits_generator(), reference_phonemes, processor.tokenizer)


def test_stream_decode_util():
    import numpy as np
    from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC

    processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
    model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h")
    device = "cpu"

    sample_rate = 16000
    audio_chunk = np.zeros(sample_rate, dtype=np.float32)

    reference_phonemes = ["h", "ə", "l", "oʊ"]

    results = list(stream_decode_util([audio_chunk], reference_phonemes, processor, model, device, sample_rate))

    for result in results:
        print(result)


if __name__ == "__main__":
    import queue
    import sounddevice as sd
    import eng_to_ipa as ipa
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

    device = "cpu"
    duration = 5
    chunk_ms = 500
    sample_rate = 16000
    chunk_samples = int(sample_rate * chunk_ms / 1000)

    print("Loading model...", flush=True)
    processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme")
    model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme").eval()
    model.to(device)
    print("Model loaded.", flush=True)

    reference_sentence = "The quick brown fox jumps over the lazy dog"
    reference_phonemes = [p for p in processor.tokenizer.tokenize(ipa.convert(reference_sentence).replace(" ", "")) if p != "ˈ"]
    print("Reference phonemes:", reference_phonemes)

    audio_queue = queue.Queue()

    def callback(indata, _frames, _time, _status):
        audio_queue.put(indata[:, 0].copy())

    total_chunks = int(duration * 1000 / chunk_ms)

    def chunk_generator():
        with sd.InputStream(samplerate=sample_rate, channels=1, dtype="float32",
                            blocksize=chunk_samples, callback=callback):
            print(f"Recording for {duration}s, decoding every {chunk_ms}ms...", flush=True)
            for _ in range(total_chunks):
                yield audio_queue.get()

    for event in stream_decode_util(chunk_generator(), reference_phonemes, processor, model, device,
                                    sample_rate):
        print(f"  -> {event}", flush=True)

    print("Done.")

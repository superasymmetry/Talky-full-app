import torch


def stream_decode_util(audio_chunks, reference_phonemes, processor, model, device="cpu", sample_rate=16000):
    """Same evaluation logic as stream_decode in phoneme_alg.py, but takes a stream of
    audio chunks instead of recording audio, and yields match events instead of printing.

    Args:
        audio_chunks: iterable of float32 numpy arrays at sample_rate Hz.
                      The caller signals end-of-stream by exhausting the iterable.
        reference_phonemes: flat list of IPA phoneme strings to match against, in order.
        processor: Wav2Vec2Processor
        model: Wav2Vec2ForCTC
        device: torch device string (default "cpu")
        sample_rate: audio sample rate in Hz (default 16000)

    Yields:
        dict with keys:
            phoneme  (str)   – the reference phoneme
            position (int)   – its index in reference_phonemes
            label    (str)   – 'correct' | 'mispronounced' | 'omitted' | 'insertion'
            decoded  (str)   – what the model actually decoded (empty string for omitted)
            target_logit (float) – model logit for the expected phoneme at that frame
            decoded_logit (float) – model logit for the decoded phoneme at that frame
            score    (float) – 1.0 correct, 0.5 mispronounced, 0.0 omitted/insertion
    """
    reference_phonemes = [p for p in reference_phonemes if p != "ˈ"]
    pointer = 0
    phoneme2id = processor.tokenizer.get_vocab()
    logit_threshold = 5.0
    lookahead = 3

    _norm_map = [("ɹ", "r"), ("ʌ", "ə"), ("v", "f")]

    def normalize(p):
        for src, dst in _norm_map:
            p = p.replace(src, dst)
        return p

    for i, chunk in enumerate(audio_chunks):
        if pointer >= len(reference_phonemes):
            return

        inputs = processor(chunk, sampling_rate=sample_rate,
                           return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            logits = model(**inputs).logits

        predicted_ids = torch.argmax(logits, dim=-1)[0].tolist()
        logits_np = logits[0].cpu().numpy()
        blank_id = processor.tokenizer.pad_token_id
        collapsed = []
        collapsed_frames = []
        prev = None
        for fi, idx in enumerate(predicted_ids):
            if idx != prev:
                if idx != blank_id:
                    collapsed.append(idx)
                    collapsed_frames.append(fi)
                prev = idx

        special = set(processor.tokenizer.all_special_ids)
        tokens = processor.tokenizer.convert_ids_to_tokens(collapsed)
        chunk_phonemes = []
        phoneme_logits = []
        chunk_frames = []
        for fi, idx, t in zip(collapsed_frames, collapsed, tokens):
            if processor.tokenizer.convert_tokens_to_ids(t) not in special and t not in ("|", " "):
                chunk_phonemes.append(normalize(t))
                phoneme_logits.append(logits_np[fi, idx])
                chunk_frames.append(fi)
        print(f"[chunk {i+1:02d}] {chunk_phonemes}", flush=True)

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
                            print(f"  [omitted] {normalize(omitted_ph)!r}", flush=True)
                            yield {
                                "phoneme": omitted_ph,
                                "position": pointer + k,
                                "label": "omitted",
                                "decoded": "",
                                "target_logit": float("nan"),
                                "decoded_logit": float("nan"),
                                "score": 0.0,
                            }
                    pointer += best_skip

        for j, (fi, p, lv) in enumerate(zip(chunk_frames, chunk_phonemes, phoneme_logits)):
            if pointer >= len(reference_phonemes):
                print(f"  [insertion] {p!r}: {lv:.4f}", flush=True)
                continue
            target_p = normalize(reference_phonemes[pointer])
            target_id = phoneme2id.get(normalize(reference_phonemes[pointer]))
            target_lv = float(logits_np[fi, target_id]) if target_id is not None else float("nan")
            top3_ids = set(logits_np[fi].argsort()[-3:].tolist())
            target_in_top3 = target_id is not None and target_id in top3_ids
            if p == target_p or (target_id is not None and target_lv > logit_threshold) or target_in_top3:
                label = "correct"
                pos = pointer
                pointer += 1
            elif target_id is not None and target_lv > 0:
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
                        print(f"  [omitted] {normalize(omitted_ph)!r}", flush=True)
                        yield {
                            "phoneme": omitted_ph,
                            "position": pointer + k,
                            "label": "omitted",
                            "decoded": "",
                            "target_logit": float("nan"),
                            "decoded_logit": float("nan"),
                            "score": 0.0,
                        }
                    pointer += skip_to
                    label = "correct"
                    pos = pointer
                    pointer += 1
                else:
                    label = "insertion"
                    pos = None
            print(f"  [{label}] {p!r}: {lv:.4f}  target={target_p!r}: {target_lv:.4f}", flush=True)
            if pos is not None:
                score = 1.0 if label == "correct" else 0.5
                yield {
                    "phoneme": reference_phonemes[pos],
                    "position": pos,
                    "label": label,
                    "decoded": p,
                    "target_logit": target_lv,
                    "decoded_logit": lv,
                    "score": score,
                }


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

    for event in stream_decode_util(chunk_generator(), reference_phonemes, processor, model, device, sample_rate):
        print(f"  -> {event}", flush=True)

    print("Done.")

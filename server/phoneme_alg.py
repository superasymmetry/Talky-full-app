import difflib
import threading
import queue
import torch
import torchaudio
import numpy as np
import eng_to_ipa as ipa
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor, logging as hf_logging
import os
hf_logging.set_verbosity_info()
import soundfile as sf
import sounddevice as sd

device = "cpu"

print("Loading model...", flush=True)
processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme")
model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme").eval()
model.to(device)
print("Model loaded.", flush=True)

def get_phoneme_scores(input_audio, expected_sentence):
    """Evaluate phoneme accuracy of input audio against expected sentence.
    Args:
        input_audio (str): Path to the input audio file.
        expected_sentence (str): The expected sentence in text form.
    Returns:
        phoneme_scores (list): List of dictionaries with phoneme and its score.
        e.g. [{'word': 'the', 'phonemes': [{'phoneme': 'ð', 'score': 0.9}, {'phoneme': 'ə', 'score': 0.8}]}, ...]
    """
    # Load pre-trained model and processor
    # processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)
    # model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16).eval()
    # model.to(device)

    # Read and process the input audio
    audio_input, sample_rate = sf.read(input_audio)
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)
    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits
    log_probs = torch.nn.functional.log_softmax(logits, dim=-1)[0].cpu().numpy()
    probs = torch.nn.functional.softmax(logits, dim=-1)[0].cpu().numpy()
    id2phoneme = list(processor.tokenizer.get_vocab().keys())
    phoneme2id = {p: i for i, p in enumerate(id2phoneme)}

    # Convert expected sentence to IPA phonemes
    converted_ipa = ipa.convert(expected_sentence)
    words_ipa = converted_ipa.split()
    expected_ipa = converted_ipa.replace(" ", "")
    expected_ipa = [c for c in expected_ipa if c in phoneme2id]
    print("expected ipa", expected_ipa)

    # Convert expected IPA to indices
    target = [phoneme2id[p] for p in expected_ipa]
    T, N = log_probs.shape[0], len(target)

    # Viterbi forced alignment
    trellis = np.full((T + 1, N + 1), -np.inf, dtype=np.float32)
    trellis[0, 0] = 0
    for t in range(T):
        for n in range(N + 1):
            # Stay at current phoneme
            if n < N:
                trellis[t + 1, n] = np.logaddexp(trellis[t + 1, n], trellis[t, n] + log_probs[t, target[n]])
            # Move to next phoneme
            if n > 0 and n <= N:
                trellis[t + 1, n] = np.logaddexp(trellis[t + 1, n], trellis[t, n - 1] + log_probs[t, target[n - 1]])

    # Backtrack to get alignment
    t, n = T, N
    path = []
    while t > 0 and n > 0:
        p_stay = trellis[t - 1, n] + log_probs[t - 1, target[n - 1]]
        p_move = trellis[t - 1, n - 1] + log_probs[t - 1, target[n - 1]]
        if n > 0 and p_move >= p_stay:
            path.append((t - 1, n - 1))
            t -= 1
            n -= 1
        else:
            path.append((t - 1, n - 1))
            t -= 1
    path = path[::-1]

    # Assign frames to phonemes
    phoneme_frames = [[] for _ in range(N)]
    for t_idx, n_idx in path:
        if n_idx < N:
            phoneme_frames[n_idx].append(t_idx)

    # Compute scores
    probs = np.exp(log_probs)
    phoneme_scores = []
    for i, frame_idxs in enumerate(phoneme_frames):
        p = expected_ipa[i]
        max_probs = np.max(probs[frame_idxs, :], axis=1)
        second_max_probs = np.partition(probs[frame_idxs, :], -2, axis=1)[:, -2]
        score = float(np.mean(max_probs - second_max_probs))
        phoneme_scores.append({'phoneme': p, 'score': score})

    res = []
    words = expected_sentence.split()
    for i, pword in enumerate(words_ipa):
        phonemes = []
        for char in pword:
            if char == phoneme_scores[0]['phoneme']:
                phonemes.append(phoneme_scores.pop(0))
        res.append({'word': words[i], 'phonemes': phonemes})

    return res

def analyze_audio_thread(audio_path, expected_ipa):
    scores = get_phoneme_scores(audio_path, expected_ipa)
    print(scores)

def stream_decode(duration=5, chunk_ms=500, reference_phonemes=None):
    """Record audio and decode phonemes for each 200ms chunk as they arrive.
    Args:
        duration (int): Total recording duration in seconds.
        chunk_ms (int): Chunk size in milliseconds.
        reference_phonemes (list): The list of phonemes to use as a reference for alignment.
    """
    if reference_phonemes is None:
        reference_phonemes = processor.tokenizer.tokenize(ipa.convert("The quick brown fox jumps over the lazy dog.").replace(" ", ""))
    reference_phonemes = [p for p in reference_phonemes if p != "ˈ"]
    pointer = 0
    phoneme2id = processor.tokenizer.get_vocab()
    logit_threshold = 5.0  # target phoneme logit above this counts as "said"
    lookahead = 3          # how many targets ahead to scan for badly-said phonemes

    def normalize(p):
        return p.replace("ɹ", "r")

    sample_rate = 16000
    chunk_samples = int(sample_rate * chunk_ms / 1000)

    audio_queue = queue.Queue()

    def callback(indata, frames, time, status):
        audio_queue.put(indata[:, 0].copy())

    print(f"Recording for {duration}s, decoding every {chunk_ms}ms...", flush=True)
    total_chunks = int(duration * 1000 / chunk_ms)

    with sd.InputStream(samplerate=sample_rate, channels=1, dtype="float32",
                        blocksize=chunk_samples, callback=callback):
        for i in range(total_chunks):
            chunk = audio_queue.get()
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
            # Pre-align: if chunk phonemes fit a later reference offset better,
            # the user has moved past the intervening targets → mark them omitted.
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
                                print(f"  [omitted] {normalize(reference_phonemes[pointer + k])!r}", flush=True)
                        pointer += best_skip
            for j, (fi, p, lv) in enumerate(zip(chunk_frames, chunk_phonemes, phoneme_logits)):
                if pointer >= len(reference_phonemes):
                    print(f"  [insertion] {p!r}: {lv:.4f}", flush=True)
                    continue
                target_p = normalize(reference_phonemes[pointer])
                target_id = phoneme2id.get(reference_phonemes[pointer])
                target_lv = float(logits_np[fi, target_id]) if target_id is not None else float("nan")
                if p == target_p or (target_id is not None and target_lv > logit_threshold):
                    label = "correct"
                    pointer += 1
                elif target_id is not None and target_lv > 0:
                    # If the very next decoded phoneme is an exact match for this target,
                    # the current decoded is noise before the real phoneme — treat as insertion.
                    next_is_target = j + 1 < len(chunk_phonemes) and chunk_phonemes[j + 1] == target_p
                    if next_is_target:
                        label = "insertion"
                    else:
                        label = "mispronounced"
                        pointer += 1
                else:
                    label = "insertion"
                print(f"  [{label}] {p!r}: {lv:.4f}  target={target_p!r}: {target_lv:.4f}", flush=True)

    print("Done.")

if __name__ == "__main__":
    reference_sentence = "The quick brown fox jumps over the lazy dog"
    reference_phonemes = [p for p in processor.tokenizer.tokenize(ipa.convert(reference_sentence).replace(" ", "")) if p != "ˈ"]
    print("Reference phonemes:", reference_phonemes)
    stream_decode(duration=5, reference_phonemes=reference_phonemes)
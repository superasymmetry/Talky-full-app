import os
import torch
import torchaudio
import IPython
import matplotlib.pyplot as plt
from dataclasses import dataclass

os.add_dll_directory("C:\\ffmpeg\\bin")
import torchcodec


print(torch.__version__)
print(torchaudio.__version__)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
model = bundle.get_model().to(device)

labels = bundle.get_labels()
with torch.inference_mode():
    waveform, _ = torchaudio.load('./input.wav')
    emissions, _ = model(waveform.to(device))
    emissions = torch.log_softmax(emissions, dim=-1)
emission = emissions[0].cpu().detach()
# print(labels, emissions)

# --- Minimal Forced Alignment for Phonemes with Goodness Score ---
from typing import List, Dict, Any
from g2p_en import G2p

def align_phonemes(audio_path: str, transcript: str) -> List[Dict[str, Any]]:
    """
    For each word in transcript, align its phonemes to the audio and calculate a goodness score for each phoneme.
    Returns a list of dicts: {word, phonemes: [{phoneme, start, end, score}]}
    """
    # Load audio and get emissions
    with torch.inference_mode():
        waveform, _ = torchaudio.load(audio_path)
        emissions, _ = model(waveform.to(device))
        emissions = torch.log_softmax(emissions, dim=-1)
    emission = emissions[0].cpu().detach()
    sample_rate = bundle.sample_rate
    labels = bundle.get_labels()
    label_map = {c: i for i, c in enumerate(labels)}

    # G2P for phonemes
    g2p = G2p()
    words = transcript.strip().split()
    print("words", words)
    results = []
    frame_dur = waveform.size(1) / emission.size(0) / sample_rate

    # Greedy CTC decode to get best path
    pred_ids = torch.argmax(emission, dim=-1)
    pred_ids = torch.unique_consecutive(pred_ids, dim=-1)
    pred_seq = [labels[i] for i in pred_ids if i != 0]  # skip blank
    pred_str = ''.join(pred_seq).replace('|', ' ').strip()
    print("pred_str", pred_str)
    # For simplicity, align words in order (assume transcript matches audio)
    idx = 0
    for word in words:
        phonemes = [p for p in g2p(word) if p != ' ']
        print("word, phonemes", word, phonemes)
        # Find where this word starts in pred_str
        wlen = len(word)
        wstart = pred_str.find(word, idx)
        if wstart == -1:
            # Not found, skip
            idx += wlen
            continue
        idx = wstart + wlen
        # Map word chars to emission frames
        char_frames = []
        for i, c in enumerate(word):
            # Find all frames where this char appears in pred_seq
            frames = [j for j, pc in enumerate(pred_seq) if pc == c and wstart <= j < idx]
            char_frames.append(frames)
        # Flatten and get frame range for word
        flat_frames = [f for sub in char_frames for f in sub]
        if not flat_frames:
            continue
        fstart, fend = min(flat_frames), max(flat_frames)
        # Divide frames among phonemes
        n = len(phonemes)
        ph_frames = torch.linspace(fstart, fend+1, n+1, dtype=torch.int)
        ph_list = []
        for i, ph in enumerate(phonemes):
            pf_start, pf_end = ph_frames[i].item(), ph_frames[i+1].item()
            # Goodness: mean log-prob over frames for best label
            if pf_end > pf_start:
                frame_scores = [emission[f, label_map.get(ph[0].upper(), 0)].item() for f in range(pf_start, pf_end)]
                score = float(torch.tensor(frame_scores).mean()) if frame_scores else 0.0
            else:
                score = 0.0
            ph_list.append({
                'phoneme': ph,
                'start': pf_start * frame_dur,
                'end': pf_end * frame_dur,
                'score': score
            })
        results.append({'word': word, 'phonemes': ph_list})
        print("results", results)
    return results

# Example usage:
if __name__ == "__main__":
    transcript = "The quick brown fox jumps over the lazy dog"  # Replace with your transcript
    alignment = align_phonemes('./input.wav', transcript)
    for word in alignment:
        print(word)
    print('done')


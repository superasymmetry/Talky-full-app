import torch
import difflib
import torchaudio
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

import pyaudio_recording

processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h").eval()

def compute_pronunciation_score(audio_path, expected_text):
    waveform, rate = sf.read(audio_path)
    waveform = torch.tensor(waveform, dtype=torch.float32).unsqueeze(0)
    if rate != 16000:
        waveform = torchaudio.functional.resample(waveform, rate, 16000)

    input_values = processor(waveform.squeeze(), sampling_rate=16000, return_tensors="pt").input_values
    with torch.no_grad():
        logits = model(input_values).logits

    probs = torch.nn.functional.softmax(logits, dim=-1)
    conf_score = torch.mean(torch.max(probs, dim=-1).values).item()

    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)[0].lower()

    expected_text = expected_text.lower().strip()
    transcription = transcription.lower().strip()
    seq = difflib.SequenceMatcher(None, expected_text, transcription)
    similarity = seq.ratio()

    gop_score = (similarity * 0.6 + conf_score * 0.4) * 100
    return transcription, gop_score
    return transcription, gop_score


if __name__ == "__main__":
    sentence = input("Input sentence:").strip()
    filename = pyaudio_recording.record_audio(record_seconds=5)
    print("saved to", filename)
    transcription, gop_score = compute_pronunciation_score(filename, sentence)

    print(f"Recorded: {sentence}")
    print(f"Transcription {transcription}")
    print(f"GOP: {gop_score:.2f}/100")

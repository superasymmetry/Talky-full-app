import torch
import numpy as np
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from groq import Groq
import os
import dotenv
import soundfile as sf
import eng_to_ipa as ipa

dotenv.load_dotenv()

device = "cuda" if torch.cuda.is_available() else "cpu"

_processor = None
_model = None
_feedback_model = None

def _load_model_once():
    global _processor, _model, _feedback_model
    if _processor is None or _model is None:
        if _processor is None or _model is None:
            _processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)
            _model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16).eval()
            _model.to(device)
            _feedback_model = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    return _processor, _model, _feedback_model

def eval_phonemes(audio_path, expected_text, expected_ipa):
    processor, model, feedback_model = _load_model_once()
    audio_input, sample_rate = sf.read(audio_path)
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits
    probs = torch.nn.functional.softmax(logits, dim=-1)[0].cpu().numpy()
    predicted_ids = torch.argmax(logits, axis=-1)
    predicted_sentences = processor.batch_decode(predicted_ids)
    print("predicted", predicted_sentences)

    id2phoneme = list(processor.tokenizer.get_vocab().keys())
    phoneme2id = {p: i for i, p in enumerate(id2phoneme)}

    # expected ipa is something like: ['DH', 'AH0', 'K', 'W', 'IH1', 'B', 'R', 'AW1', 'N', 'F', 'AA1', 'X', 'JH', 'AH0', 'M', 'P', 'S']
    # want to convert to ipa symbols
    clean_expected_ipa = ipa.convert(expected_text).split()
    ipa_words = expected_ipa.get('words', [])
    clean_expected_ipa = [char for word in ipa_words for char in word if char != ' ']
    clean_expected_ipa = [p for p in clean_expected_ipa if p.isalpha() or p.isalnum()]
    print("expected ipa", clean_expected_ipa)

    # Compute phoneme goodness score
    phoneme_err = 0
    T, N = probs.shape[0], len(clean_expected_ipa)
    frame_splits = np.array_split(np.arange(T), N)
    phoneme_scores = []
    for i, p in enumerate(clean_expected_ipa):
        frames = frame_splits[i]
        print("Frames for phoneme", p, frames)
        if len(frames) == 0:
            phoneme_scores.append({'phoneme': p, 'score': 0.0})
            continue
        idx = phoneme2id.get(p, None)
        if idx is not None:
            print("Phoneme", p, "has index", idx)
            expected_probs = probs[frames, idx]
            # Exclude the expected phoneme from the "other" set
            other_probs = np.delete(probs[frames, :], idx, axis=1)
            max_other_probs = np.max(other_probs, axis=1)
            margin = expected_probs - max_other_probs
            score = float(np.mean(margin))
            phoneme_scores.append({'phoneme': p, 'score': score})
        else:
            phoneme_scores.append({'phoneme': p, 'score': 0.0})
            print("Phoneme not found in vocabulary:", p)
        print("phoneme, score", p, phoneme_scores[-1]['score'])

    feedback = "dummy feedback"
    return (predicted_sentences[0], feedback, phoneme_err, expected_ipa)

eval_phonemes("input.wav", "the quick brown fox jumps over the lazy dog", {'words': ['ð', 'ə', 'k', 'w', 'ɪ', 'k', 'b', 'r', 'a', 'ʊ', 'n', 'f', 'ɑ', 'k', 's', 'ʤ', 'ʌ', 'm', 'p', 't', 'o', 'ʊ', 'v', 'ə', 'r', 'ð', 'ə', 'l', 'e', 'ɪ', 'z', 'i', 'd', 'ɔ', 'g']})
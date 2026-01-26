# from functools import partial

# import numpy as np
# from transformers import pipeline
# from scipy.io import wavfile

# def transcribe(
#     audio,
#     transcriber_choice: str,
# ):
#     """
#     The transcribe function takes a single parameter, audio, which is a numpy array of the audio the user recorded.
#     The pipeline object expects this in float32 format,so we convert it first to float32, and then extract the transcribed text.
#     """
#     transcriber = pipeline("automatic-speech-recognition", model=transcriber_choice)
#     try:
#         sr, y = audio
#     except TypeError:
#         return None
#     y = y.astype(np.float32)
#     y /= np.max(np.abs(y))
#     transcription = transcriber({"sampling_rate": sr, "raw": y})["text"]
#     return transcription


# transcribe_to_phonemes = partial(
#     transcribe, transcriber_choice="facebook/wav2vec2-lv-60-espeak-cv-ft"
# )


# sr, y = wavfile.read("server\\input.wav")

# # 2. Parse phonemes
# phoneme_str = transcribe_to_phonemes((sr, y))

# print("Phoneme output:", phoneme_str)

# import os
# from phonemizer.backend.espeak.wrapper import EspeakWrapper
# from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
# from phonemizer import phonemize

# # Configuración de Espeak (Hugging Face suele instalarlo aquí)
# _ESPEAK_LIBRARY = "C:\\Program Files (x86)\\eSpeak\\espeak_sapi.dll"
# if os.path.exists(_ESPEAK_LIBRARY):
#     EspeakWrapper.set_library(_ESPEAK_LIBRARY)

# MODEL_ID = "facebook/wav2vec2-lv-60-espeak-cv-ft"
# processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
# model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID)


from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC 
from datasets import load_dataset
import torch
import soundfile as sf
from gtts import gTTS

reference_text = "the quick brown fox jumps over the lazy dog"
myobj = gTTS(text=reference_text, lang='en', slow=False)
myobj.save("reference.wav")

# load model and processor
processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)
model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

# Read and process the input
audio_input, sample_rate = sf.read("input.wav")
inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

with torch.no_grad():
    logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits

# Decode id into string
predicted_ids = torch.argmax(logits, axis=-1)      
predicted_sentences = processor.batch_decode(predicted_ids)
print(predicted_sentences)

audio_input, sample_rate = sf.read("reference.wav")
inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

with torch.no_grad():
    logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits

# Decode id into string
predicted_ids = torch.argmax(logits, axis=-1)      
reference_ipa = processor.batch_decode(predicted_ids)
print(reference_ipa)


# import parselmouth

# sound = parselmouth.Sound("input.wav")
# pitch = sound.to_pitch()
# intensity = sound.to_intensity()

# print(pitch, intensity)

# point_process = parselmouth.praat.call(sound, "To PointProcess (periodic, cc)", 75, 500)
# jitter = parselmouth.praat.call(
#     point_process, "Get jitter (local)", 
#     0, 0, 0.0001, 0.02, 1.3
# )
# shimmer = parselmouth.praat.call(
#     [sound, point_process], "Get shimmer (local)",
#     0, 0, 0.0001, 0.02, 1.3, 0.03
# )

# print(f"Jitter: {jitter}", f"Shimmer: {shimmer}")

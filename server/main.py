from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
import random
from dotenv import load_dotenv
from database import client, db, users_collection
from user_routes import user_bp
from score_routes import score_bp
from gop_eval import compute_pronunciation_score
import threading
import torch
import difflib
import torchaudio
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
from gtts import gTTS
import jiwer
import pyaudio_recording

load_dotenv()

app = Flask(__name__)
cors = CORS(app)

# Register routes
app.register_blueprint(user_bp)
app.register_blueprint(score_bp)

print("\n=== Registered Routes ===")
for rule in app.url_map.iter_rules():
    print(f"{rule.methods} -> {rule.rule}")
print("========================\n")

_processor = None
_model = None
_feedback_model = None
_load_lock = threading.Lock()
device = "cuda" if torch.cuda.is_available() else "cpu"

phoneme_word_bank = {
    "p": ["pat", "pop", "paper", "puppy", "apple", "stop", "pepper", "paint"],
    "b": ["bat", "baby", "bubble", "rabbit", "club", "cab", "bag", "bagel"],
    "t": ["top", "table", "tiger", "ticket", "cat", "stop", "butter", "water"],
    "d": ["dog", "daddy", "dinner", "red", "bed", "ladder", "mud", "idea"],
    "k": ["cat", "kite", "cookie", "back", "duck", "kick", "bicycle", "kitchen"],
    "g": ["go", "garden", "giraffe", "egg", "big", "tiger", "gum", "garden"],

    "f": ["fan", "fish", "coffee", "fine", "leaf", "shelf", "roof", "fun"],
    "v": ["van", "vase", "seven", "move", "give", "river", "love", "eleven"],
    "s": ["sun", "sit", "pass", "grass", "mess", "socks", "sister", "bus"],
    "z": ["zoo", "zip", "buzz", "lazy", "size", "zero", "nose", "fuzzy"],
    "ʃ": ["shoe", "she", "wash", "push", "wish", "shark", "ash", "shelf"],
    "ʒ": ["measure", "vision", "beige", "garage", "treasure", "rouge"],

    "tʃ": ["cherry", "church", "chair", "cheese", "watch", "teacher", "chocolate", "patch"],
    "dʒ": ["jump", "jam", "jacket", "judge", "giant", "badge", "edge", "jar"],

    "m": ["man", "mom", "milk", "smile", "lamp", "moon", "hammer", "summer"],
    "n": ["no", "nice", "ten", "banana", "sun", "pen", "knee", "napkin"],
    "ŋ": ["sing", "king", "ring", "song", "long", "wing", "thing", "hanging"],

    "l": ["lion", "light", "leaf", "ball", "yellow", "luck", "little", "label"],
    "r": ["rabbit", "red", "rose", "car", "train", "mirror", "river", "try"],

    "w": ["water", "win", "wake", "week", "swing", "window", "white", "queen"],
    "j": ["yes", "yellow", "you", "yarn", "yogurt", "young", "year", "beyond"],

    "a": ["cat", "apple", "father", "back", "dance", "fast", "bat"],
    "e": ["bed", "red", "pen", "eleven", "ten", "egg", "set"],
    "i": ["sit", "little", "bit", "fish", "miss", "pin", "sit"],
    "o": ["go", "no", "so", "open", "boat", "home", "note"],
    "u": ["cup", "duck", "sun", "bus", "up", "bug", "music"],
}

                
def _load_model_once():
    global _processor, _model, _feedback_model
    if _processor is None or _model is None:
        with _load_lock:
            if _processor is None or _model is None:
                _processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)
                _model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16).eval()
                _model.to(device)
                _feedback_model = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    return _processor, _model, _feedback_model

def compute_pronunciation_score(audio_path, expected_text):
    processor, model, feedback_model = _load_model_once()

    waveform, rate = sf.read(audio_path)
    waveform = torch.tensor(waveform, dtype=torch.float32).unsqueeze(0)
    if rate != 16000:
        waveform = torchaudio.functional.resample(waveform, rate, 16000)

    input_values = processor(waveform.squeeze(), sampling_rate=16000, return_tensors="pt").input_values
    with torch.no_grad():
        logits = model(input_values).logits

    probs = torch.nn.functional.softmax(logits, dim=-1)
    conf_score = float(torch.mean(torch.max(probs, dim=-1).values).item())

    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)[0].lower()

    expected_text = expected_text.lower().strip()
    transcription = transcription.lower().strip()
    seq = difflib.SequenceMatcher(None, expected_text, transcription)
    similarity = seq.ratio()

    gop_score = (similarity * 0.6 + conf_score * 0.4) * 100
    if gop_score > 80:
        feedback = "Great job!"
    else:
        _feedback_prompt = f"This is the transcription of a spoken sentence that I spoke: '{transcription}'. The expected sentence was: '{expected_text}'. Based on common speech impediments (r, w, l, th, f, s, v, b, ch, sh sounds), please deduce which sounds were mispronounced, as well as the words that were mispronounced, and provide me constructive feedback on how to improve the pronunciation. Output one short sentence of feedback and ONLY the one short sentence."
        feedback = _feedback_model.chat.completions.create(
            messages=[{"role": "user", "content": _feedback_prompt}],
            model="llama-3.1-8b-instant",
        ).choices[0].message.content.strip()
        feedback = "Hmm, try again. " + feedback
    return (transcription, feedback, gop_score)

def phoneme_error_rate(reference, hypothesis):
    # Tokenize by space
    ref = reference.split()
    hyp = hypothesis.split()
    # Join with space for jiwer
    ref_str = " ".join(ref)
    hyp_str = " ".join(hyp)
    wer = jiwer.wer(ref_str, hyp_str) * 100
    return wer

def eval_phonemes(audio_path, expected_text):
    processor, model, feedback_model = _load_model_once()
    reference_text = expected_text
    myobj = gTTS(text=reference_text, lang='en', slow=False)
    myobj.save("reference.wav")
    audio_input, sample_rate = sf.read(audio_path)
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits

    predicted_ids = torch.argmax(logits, axis=-1)      
    predicted_sentences = processor.batch_decode(predicted_ids)
    print(predicted_sentences)

    audio_input, sample_rate = sf.read("reference.wav")
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits

    predicted_ids = torch.argmax(logits, axis=-1)      
    reference_ipa = processor.batch_decode(predicted_ids)
    print(reference_ipa)

    phoneme_err = phoneme_error_rate(reference_ipa[0], predicted_sentences[0])
    print(f"Phoneme Error Rate: {phoneme_err}")
    if phoneme_err < 70:
        feedback = "Great, you've completed this sentence! Go on."
    else:
        _feedback_prompt = f"This is the transcription of a spoken sentence that I spoke: '{predicted_sentences[0]}'. The expected sentence was: '{expected_text}'. Based on common speech impediments (r, w, l, th, f, s, v, b, ch, sh sounds), please deduce which sounds were mispronounced, as well as the words that were mispronounced, and provide me constructive feedback on how to improve the pronunciation. Output one short sentence of feedback and ONLY the one short sentence."
        feedback = _feedback_model.chat.completions.create(
            messages=[{"role": "user", "content": _feedback_prompt}],
            model="llama-3.1-8b-instant",
        ).choices[0].message.content.strip()
        feedback = "Hmm, try again. " + feedback
    return (predicted_sentences[0], feedback, phoneme_err)

@app.route('/api/lessons', methods=['GET', 'POST'])
def lessons():
    user_id = request.args.get('user_id')
    lesson_id = request.args.get('lesson_id')
    print("user id------------------", user_id)
    user = users_collection.find_one({"userId": user_id})
    print("typeof lesson", type(lesson_id))
    lesson = user.get('lessons', [])[int(lesson_id)]
    word_list = lesson.get('words', [])
    print(word_list)
    prompt = f"""
    Your tasks is to generate a list of 7 sentences for speech therapy practice. 
    Please generate the sentences based on these words: {word_list}.
    Each sentence should be between 5-10 words long. Please return the sentences in JSON format as follows:
    {{
        1: "first sentence",
        2: "second sentence",
        ...
        7: "seventh sentence"
        }}
    """
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.1-8b-instant",
        response_format={"type": "json_object"}
    )

    sentences = jsonify(chat_completion.choices[0].message.content)
    print(sentences)
    return sentences

@app.route('/api/record', methods=['POST', 'GET'])
def backend_record():
    '''For API call in Lesson.jsx: records audio, computes pronunciation score, and returns feedback
        Inputs: JSON with "card" field (sentence to be spoken)
        Returns: JSON with "score", "feedback", "passed", "transcription", and "reference" fields
    '''
    # if request.method == 'POST':
    #     import pyaudio_recording
    #     sentence = request.get_json()['card']
    #     filename = pyaudio_recording.record_audio(record_seconds=5)
    #     transcription, feedback, score = compute_pronunciation_score(filename, sentence)
    #     return jsonify({"filename": filename, "score": score, "feedback": feedback, "passed": score > 90}), 200
    if request.method == 'POST':
        sentence = request.get_json()['card']
        filename = pyaudio_recording.record_audio(record_seconds=4)
        transcription, feedback, score = eval_phonemes(filename, sentence)
        return jsonify({"score": score, "feedback": feedback, "passed": score < 70, "transcription": transcription, "reference": sentence}), 200

@app.route('/api/wordbank', methods=['GET', 'POST'])
def wordbank():
    '''For wordbank: generates a list of 16 words based on a sound category
        Inputs: JSON with "category" field (e.g., "L-sounds", "animals", etc.)
        Returns: JSON object with 16 words and corresponding emojis
    '''
    if request.method == 'POST':
        category = request.json.get('category', 'general')
    else:
        category = request.args.get('category', 'general')

    model = "llama-3.1-8b-instant"

    # Updated prompt: include emojis for each word
    prompt = f"""
    Your task is to generate 16 words for speech therapy practice. 
    Return your output **only** as a JSON object in this format:

    {{
    1: {{"word": "first word", "emoji": "🍎"}},
    2: {{"word": "second word", "emoji": "🐶"}},
    ...
    16: {{"word": "sixteenth word", "emoji": "🚀"}}
    }}

    Follow these strict rules:
    - The words must fit the category: {category}.
    - For phoneme-specific categories (e.g., "L-sounds"), vary the number of syllables (1-3) and the phoneme position (initial, medial, final).
    - Each emoji **must directly represent** the word — for example:
    - "cat" → 🐱
    - "apple" → 🍎
    - "rain" → 🌧️
    - "star" → ⭐
    - Do not use abstract words or emojis that don't visually match.
    - Output must be valid JSON, with no text outside the JSON.
    """

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        response_format={"type": "json_object"}
    )

    return jsonify(chat_completion.choices[0].message.content)

@app.route("/")
def home():
    users = list(users_collection.find({}, {"_id": 0}))
    return jsonify(users)

if __name__ == '__main__':
    app.run(port=8080, debug=True, use_reloader=False)

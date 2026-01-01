from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv
# import database
# from user_routes import user_bp
# from score_routes import score_bp
from gop_eval import compute_pronunciation_score
import threading
import torch
import difflib
import torchaudio
import soundfile as sf
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

load_dotenv()

app = Flask(__name__)
cors = CORS(app, origin="*")

# Register routes
# app.register_blueprint(user_bp)
# app.register_blueprint(score_bp)

_processor = None
_model = None
_feedback_model = None
_load_lock = threading.Lock()

def _load_model_once():
    global _processor, _model, _feedback_model
    if _processor is None or _model is None:
        with _load_lock:
            if _processor is None or _model is None:
                _processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
                _model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h").eval()
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
        _feedback_prompt = f"This is the transcription of a spoken sentence that I spoke: '{transcription}'. The expected sentence was: '{expected_text}'. Based on common speech impediments (r, w, l, th, f, s, v, b, ch, sh sounds), please deduce which sounds were mispronounced, as well as the words that were mispronounced, and provide me constructive feedback on how to improve the pronunciation. Output one sentence of feedback and ONLY the one sentence."
        feedback = _feedback_model.chat.completions.create(
            messages=[{"role": "user", "content": _feedback_prompt}],
            model="llama-3.1-8b-instant",
        ).choices[0].message.content.strip()
        feedback += "Hmm, try again. "
    return (transcription, feedback, gop_score)


@app.route('/api/lessons', methods=['GET', 'POST'])
def lessons():
    # dummy word list. would replace with actual list from db or request
    word_list = ["rainbow", "racecar", "rocket", "rabbit", "ring", "road", "rose"]
    
    prompt = f"""
    Your tasks is to generate a list of 7 sentences for speech therapy practice. 
    Please generate ethe sentences based on these words: {word_list}.
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
    if request.method == 'POST':
        import pyaudio_recording
        sentence = request.get_json()['card']
        filename = pyaudio_recording.record_audio(record_seconds=5)
        transcription, feedback, score = compute_pronunciation_score(filename, sentence)
        return jsonify({"filename": filename, "score": score, "feedback": feedback, "passed": score > 90}), 200

@app.route('/api/wordbank', methods=['GET', 'POST'])
def wordbank():
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

@app.route("/add_user", methods=["POST"])
def add_user():
    data = request.get_json()
    users_collection.insert_one(data)
    return jsonify({"message": "User added successfully!"})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

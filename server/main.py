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

load_dotenv()

app = Flask(__name__)
cors = CORS(app, origin="*")

# Register routes
app.register_blueprint(user_bp)
app.register_blueprint(score_bp)

_processor = None
_model = None
_feedback_model = None
_load_lock = threading.Lock()

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
    '''For API call in Lesson.jsx: records audio, computes pronunciation score, and returns feedback
        Inputs: JSON with "card" field (sentence to be spoken)
        Returns: JSON with "filename", "score", "feedback, and "passed" fields
    '''
    if request.method == 'POST':
        import pyaudio_recording
        sentence = request.get_json()['card']
        filename = pyaudio_recording.record_audio(record_seconds=5)
        transcription, feedback, score = compute_pronunciation_score(filename, sentence)
        return jsonify({"filename": filename, "score": score, "feedback": feedback, "passed": score > 90}), 200

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

@app.route("/add_user", methods=["POST"])
def add_user():
    '''For initializing a user in mongodb database: inserts initial user document
        Inputs: None
        Returns: JSON object of user document
    '''
    data = request.get_json()
    user_id = data.get("userId")
    name = data.get("name", "")
    
    phonemes = ["l", "r", "p", "b", "t", "d", "k", "g", "f", "v", "s", "z", 
                "ʃ", "sh", "ʒ", "tʃ", "ch", "dʒ", "j", "m", "n", "ŋ", "w", "y",
                "a", "e", "i", "o", "u"]
    phoneme_scores = [{"phoneme": ph, "avgScore": None, "attempts": None} for ph in phonemes]
    initial_history = {ph: 0 for ph in phonemes}
    
    user_doc = {
        "userId": user_id,
        "name": name,
        "progress": {
            "phonemeScores": phoneme_scores,
            "wordScores": []
        },
        "history": [initial_history],
        "lessons": {
            1: {"phoneme": "r", "words": ["rainbow", "racecar"], "score": 0},
            2: {"phoneme": "r", "words": ["red", "read"], "score": 0},
            "Game": {"phoneme": "l", "words": ["lion", "leaf"], "score": 0},
            3: {"phoneme": "l", "words": ["lion", "leaf"], "score": 0},
            4: {"phoneme": "l", "words": ["letter", "learn"], "score": 0},
        }
    }
    users_collection.insert_one(user_doc)
    return jsonify(user_doc)

@app.get("/api/user/progress")
def get_user_progress():
    '''For getting user's weaknesses: retrieves user's phoneme scores from database
        Inputs: user_id (string)
        Returns: JSON of phonemeScores
    '''
    user_id = request.args.get("user_id")
    user = users_collection.find_one({"userId": user_id}, {"progress.phonemeScores": 1})
    
    if not user or "progress" not in user:
        raise Exception("User not found or progress data missing")
    
    return {"phonemeScores": user["progress"].get("phonemeScores", [])}

@app.get("/api/user/history")
def get_user_history(user_id):
    '''For viewing user's history: retrieves user's history data from database
        Inputs: user_id (string)
        Returns: JSON of history
    '''
    user_id = request.args.get("user_id")
    user = users_collection.find_one({"userId": user_id}, {"history": 1})
    if not user or "history" not in user:
        raise Exception("User not found or history data missing")
    return {"history": user["history"]}

@app.get("/api/user/lessons")
def get_user_lessons(user_id):
    '''For determining which lessons have been completed: retrieves user's lessons data from database
        Inputs: user_id (string)
        Returns: JSON of lessons (dictionary with lesson_id as key)
    '''
    user_id = request.args.get("user_id")
    user = users_collection.find_one({"userId": user_id}, {"lessons": 1})
    if not user or "lessons" not in user:
        raise Exception("User not found or lessons data missing")
    return {"lessons": user["lessons"]}

@app.route('/api/generate-next-lesson', methods=['POST'])
def generate_next_lesson():
    '''For generating the next lesson based on user's weaknesses when current lesson completes:
        Updates lessons field in database with new lesson
        Inputs: user_id (string)
        Returns: JSON of new lesson data
    '''
    user_id = request.args.get("user_id")
    user = users_collection.find_one({"userId": user_id}, {"lessons": 1}, {"progress": 1}, {"history": 1})
    if not user:
        return jsonify({"error": "User not found"}), 404
    else:
        lastlesson_id = max([k for k in user['lessons'].keys() if isinstance(k, int)])
        next_lesson_id = lastlesson_id + 1
        ps = user['progress']['phonemeScores']
        min_idx = min([(i, p['avgScore']) for i, p in enumerate(ps) if p.get('avgScore') is not None], key=lambda x: x[1])[0]
        weakest_phoneme = ps[min_idx]['phoneme']
        words = random.sample(phoneme_word_bank.get(weakest_phoneme, ["practice", "word"]), k=2)
        # insert new lesson into mongodb
        new_lesson = {f"lessons.{next_lesson_id}": {
                "phoneme": weakest_phoneme,
                "words": words,
                "score": 0
            }}
        users_collection.update_one(
            {"userId": user_id},
            {"$set": new_lesson},
        )
        return jsonify(new_lesson)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

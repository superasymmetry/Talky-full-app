import collections
import logging
import eng_to_ipa as ipa
import numpy as np
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv
from database import client, db, users_collection, phoneme_video_cache
from find_video import get_video_for_phoneme
from user_routes import user_bp
from score_routes import score_bp
import threading
import re
import json
import threading, queue
from stream_decode_util import stream_decode_util

load_dotenv()

# Without this, logger.info/.warning calls in this file and in find_video.py
# go nowhere — Flask doesn't configure the root logger for you. Set
# LOG_LEVEL=DEBUG in the environment if you need to see search_videos'
# per-request detail too.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://talkwithtalky.org,https://d26pahabsgpl8k.cloudfront.net,http://localhost:3000,http://localhost:5173"
    ).split(",")
]

# Prevent accidentally allowing every website
if "*" in ALLOWED_ORIGINS:
    raise ValueError("Wildcard '*' is not allowed for CORS origins.")

app = Flask(__name__)

socketio = SocketIO(
    app,
    cors_allowed_origins=ALLOWED_ORIGINS,
    async_mode="threading"
)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ALLOWED_ORIGINS,
            "supports_credentials": False,
        }
    },
)

# Register routes
app.register_blueprint(user_bp)
app.register_blueprint(score_bp)

from tts.tts import tts_bp
app.register_blueprint(tts_bp)

print(app.url_map)

print("\n=== Registered Routes ===")
for rule in app.url_map.iter_rules():
    print(f"{rule.methods} -> {rule.rule}")
print("========================\n")

_processor = None
_model = None
_feedback_model = None
_device = None
_load_lock = threading.Lock()

sessions = {}

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
arpabet_to_ipa = {
    "AA": "ɑ", "AA0": "ɑ", "AA1": "ɑ", "AA2": "ɑ",
    "AE": "æ", "AE0": "æ", "AE1": "æ", "AE2": "æ",
    "AH": "ʌ", "AH0": "ə", "AH1": "ʌ", "AH2": "ʌ",
    "AO": "ɔ", "AO0": "ɔ", "AO1": "ɔ", "AO2": "ɔ",
    "AW": "aʊ", "AW0": "aʊ", "AW1": "aʊ", "AW2": "aʊ",
    "AY": "aɪ", "AY0": "aɪ", "AY1": "aɪ", "AY2": "aɪ",
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "EH": "ɛ", "EH0": "ɛ", "EH1": "ɛ", "EH2": "ɛ",
    "ER": "ɝ", "ER0": "ɚ", "ER1": "ɝ", "ER2": "ɝ",
    "EY": "eɪ", "EY0": "eɪ", "EY1": "eɪ", "EY2": "eɪ",
    "F": "f",
    "G": "g",
    "HH": "h",
    "IH": "ɪ", "IH0": "ɪ", "IH1": "ɪ", "IH2": "ɪ",
    "IY": "i", "IY0": "i", "IY1": "i", "IY2": "i",
    "JH": "ʤ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "OW": "oʊ", "OW0": "oʊ", "OW1": "oʊ", "OW2": "oʊ",
    "OY": "ɔɪ", "OY0": "ɔɪ", "OY1": "ɔɪ", "OY2": "ɔɪ",
    "P": "p",
    "R": "ɹ",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "UH": "ʊ", "UH0": "ʊ", "UH1": "ʊ", "UH2": "ʊ",
    "UW": "u", "UW0": "u", "UW1": "u", "UW2": "u",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ"
}

# Strips newlines/control characters from user-supplied values (query
# params, etc.) before they're written into a log line. Without this, an
# attacker can pass e.g. user_id=demo%0d%0a<fake log line> to inject a
# forged entry that looks like a genuine log record — this is the classic
# CRLF/log-injection issue (CWE-117). Only needed for values that originate
# from outside our system (request.args); values we generate ourselves
# (e.g. target_phoneme, which only ever comes from phoneme_word_bank keys
# or our own Mongo cache) don't need it.
_LOG_CONTROL_CHARS_RE = re.compile(r'[\r\n\x00-\x1f\x7f]')


def _sanitize_for_log(value):
    return _LOG_CONTROL_CHARS_RE.sub('', str(value))


# IPA digraphs that must be treated as a single phoneme token
_IPA_DIGRAPHS = {"aʊ", "aɪ", "eɪ", "oʊ", "ɔɪ", "tʃ"}
_IPA_SKIP = set(" ˈˌːˑ'")

def _word_to_phonemes(word):
    """Convert an English word to a list of IPA phoneme strings using eng_to_ipa."""
    clean = re.sub(r"[^a-zA-Z'-]", "", word)
    if not clean:
        return []
    ipa_str = ipa.convert(clean)
    if not ipa_str or "*" in ipa_str:
        return []
    result = []
    i = 0
    while i < len(ipa_str):
        two = ipa_str[i:i+2]
        if two in _IPA_DIGRAPHS:
            result.append(two)
            i += 2
        elif ipa_str[i] not in _IPA_SKIP:
            result.append(ipa_str[i])
            i += 1
        else:
            i += 1
    return result


def _resolve_target_phoneme(lesson, word_list):
    """
    Figures out which phoneme this lesson is drilling, so we can attach an
    intro video for it. Every lesson document (see adduser/generatenextlesson
    in user_routes.py) is written with a "phoneme" field, so this is the
    normal path. The word-bank reverse-match below is only a safety net for
    stray/legacy lesson documents that predate that field.
    """
    explicit = lesson.get('phoneme')
    if explicit:
        return explicit

    word_set = {w.lower() for w in word_list}
    best_phoneme, best_overlap = None, 0
    for phoneme, bank_words in phoneme_word_bank.items():
        overlap = len(word_set.intersection(w.lower() for w in bank_words))
        if overlap > best_overlap:
            best_phoneme, best_overlap = phoneme, overlap
    return best_phoneme


def _load_model_once():
    global _processor, _model, _feedback_model, _device
    if _processor is None or _model is None:
        with _load_lock:
            if _processor is None or _model is None:
                import torch
                from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

                device = "cuda" if torch.cuda.is_available() else "cpu"
                _processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme")
                _model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme").eval()
                _model.to(device)
                _feedback_model = Groq(api_key=os.environ.get("GROQ_API_KEY"))
                _device = device
    return _processor, _model, _feedback_model, _device

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

    sentences_str = chat_completion.choices[0].message.content
    sentences = json.loads(sentences_str)
    # If the LLM wrapped sentences under a "sentences" key, unwrap it
    if "sentences" in sentences and isinstance(sentences["sentences"], dict):
        sentences = sentences["sentences"]

    # expected_ipa is a list of ordereddicts mapping word to ipa phonemes for each sentence
    # words_to_ipa_list is a list of lists of dicts with "word" and "phonemes" keys
    expected_ipas = []
    words_to_ipa_list = []
    try:
        for sentence in sentences.values():
            sentence_phonemes = collections.OrderedDict()
            for word in sentence.split():
                phonemes = _word_to_phonemes(word)
                # print("word, phonemes", word, phonemes)
                sentence_phonemes[word] = phonemes
            expected_ipas.append(sentence_phonemes)
            words_to_ipa = [{"word": word, "phonemes": phonemes} for word, phonemes in sentence_phonemes.items()]
            words_to_ipa_list.append(words_to_ipa)
    except Exception as e:
        print(f"IPA computation error: {e}")
        expected_ipas = []
        words_to_ipa_list = []

    # Resolve + attach the phoneme-specific intro video (Mongo-cached, see
    # find_video.py — only ever hits YouTube once per phoneme).
    target_phoneme = _resolve_target_phoneme(lesson, word_list)
    logger.info(
        "Lesson %s for user %s | words=%s target_phoneme=%r",
        _sanitize_for_log(lesson_id), _sanitize_for_log(user_id), word_list, target_phoneme,
    )

    intro_video_id = None
    if target_phoneme:
        try:
            intro_video_id = get_video_for_phoneme(target_phoneme, phoneme_video_cache)
        except Exception as e:
            logger.exception("Video lookup failed for phoneme %r", target_phoneme)
    else:
        logger.warning(
            "No target_phoneme resolved for lesson %s (user %s) — "
            "intro_video_id will be null, frontend will use its default.",
            _sanitize_for_log(lesson_id), _sanitize_for_log(user_id),
        )

    logger.info("Resolved intro_video_id=%r for phoneme=%r", intro_video_id, target_phoneme)

    return jsonify({
        "sentences": sentences,
        "expected_ipas": expected_ipas,
        "words_to_ipas": words_to_ipa_list,
        "target_phoneme": target_phoneme,
        "intro_video_id": intro_video_id,
        "intro_video_start": 0,
    })


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

def finalize_session(sid):
    session = sessions.pop(sid, None)
    if not session:
        return
    results = session['results']
    total_words = len(session.get('words_ipa', []))
    avg = len(results) / total_words if total_words > 0 else 0.0
    socketio.emit('result', {
        'score': avg,
        'passed': avg >= 0.8,
        'feedback': "Great job!" if avg >= 0.8 else "Hmm, try again.",
        'res': results,
    }, to=sid)

@socketio.on('connect')
def handle_connect(auth=None):
    print(f"Client connected: {request.sid}")

@socketio.on('start')
def handle_start(data):
    sid = request.sid
    words_ipa = data['words_ipa']
    flat_phonemes = [p for w in words_ipa for p in w['phonemes']]
    position_to_word_idx = [
        word_idx
        for word_idx, w in enumerate(words_ipa)
        for _ in w['phonemes']
    ]
    chunk_queue = queue.Queue()
    session = {'words_ipa': words_ipa, 'queue': chunk_queue, 'results': []}
    sessions[sid] = session

    def run():
        processor, model, _, device = _load_model_once()
        word_phoneme_scores = [[] for _ in words_ipa]

        def drain():
            while (item := chunk_queue.get()) is not None:
                yield item

        for match in stream_decode_util(drain(), flat_phonemes, processor, model, device):
            word_idx = position_to_word_idx[match['position']]
            word_phoneme_scores[word_idx].append({'phoneme': match['phoneme'], 'score': match['score']})
            word_entry = words_ipa[word_idx]
            if len(word_phoneme_scores[word_idx]) == len(word_entry['phonemes']):
                scores = word_phoneme_scores[word_idx]
                result = {
                    'word_index': word_idx,
                    'word': word_entry['word'],
                    'phonemes': scores,
                    'score': sum(p['score'] for p in scores) / len(scores),
                }
                session['results'].append(result)
                socketio.emit('partial_result', result, to=sid)
        finalize_session(sid)

    threading.Thread(target=run, daemon=True).start()
    print(f"Session started for {sid}: {data['sentence']}")


@socketio.on('chunk')
def handle_chunk(data):
    session = sessions.get(request.sid)
    if session:
        session['queue'].put(np.frombuffer(data, dtype=np.float32))


@socketio.on('stop')
def handle_stop():
    session = sessions.get(request.sid)
    if session:
        session['queue'].put(None)


@socketio.on('disconnect')
def handle_disconnect():
    session = sessions.pop(request.sid, None)
    if session:
        session['queue'].put(None)  # unblock the background thread


@app.route("/", methods=["GET"])
def home():
    users = list(users_collection.find({}, {"_id": 0}))
    return jsonify(users)

@app.route("/health", methods=["GET", "HEAD"])
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    socketio.run(app, host='0.0.0.0', port=port, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
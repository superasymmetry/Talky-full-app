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
from lesson_attempt_routes import lesson_attempt_bp
import threading
import re
import json
import threading, queue
from stream_decode_util import stream_decode_util, stream_decode_logits, prosody_event, normalize
from prosody_eval import warmup_async

load_dotenv()

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("main")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://talkwithtalky.org,https://d26pahabsgpl8k.cloudfront.net,http://localhost:3000,http://localhost:5173,http://localhost:5174"
    ).split(",")
]

if "*" in ALLOWED_ORIGINS:
    raise ValueError("Wildcard '*' is not allowed for CORS origins.")

MODEL = "vitouphy/wav2vec2-xls-r-300m-timit-phoneme"

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

@app.before_request
def _handle_cors_preflight():
    if request.method == "OPTIONS":
        return app.make_default_options_response()

app.register_blueprint(user_bp)
app.register_blueprint(score_bp)
app.register_blueprint(lesson_attempt_bp)

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

warmup_async()

sessions = {}

WORD_FAIL_SCORE_THRESHOLD = 0.3

PHONEME_DELTA_MARGIN = 0.05

TARGET_PHONEME_WEIGHT = 4.0

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

_LOG_CONTROL_CHARS_RE = re.compile(r'[\r\n\x00-\x1f\x7f]')

def _sanitize_for_log(value):
    return _LOG_CONTROL_CHARS_RE.sub('', str(value))

def _word_to_phonemes(word):
    """Convert an English word to a list of IPA phoneme strings.

    Tokenizes the eng_to_ipa output with the wav2vec2 tokenizer (instead of
    hand-splitting digraphs) and drops any phoneme whose normalized form isn't
    in the model vocab — a reference phoneme the model can never emit would
    otherwise always be scored as mispronounced/omitted.
    """
    clean = re.sub(r"[^a-zA-Z'-]", "", word)
    if not clean:
        return []
    ipa_str = ipa.convert(clean)
    if not ipa_str or "*" in ipa_str:
        return []
    tokenizer = _load_processor_once().tokenizer
    special = set(tokenizer.all_special_tokens)
    norm_vocab = {normalize(t) for t in tokenizer.get_vocab()
                  if t not in special and t not in ("|", " ")}
    return [p for p in tokenizer.tokenize(ipa_str)
            if p not in special and p not in ("|", " ", "ˈ", "ˌ", "ː", "ˑ", "'")
            and normalize(p) in norm_vocab]

def _load_processor_once():
    """Load only the processor (tokenizer + feature-extractor config).
    Used for sessions where the client streams precomputed wav2vec2 logits,
    so the torch model never needs to be loaded server-side."""
    global _processor
    if _processor is None:
        with _load_lock:
            if _processor is None:
                from transformers import Wav2Vec2Processor
                _processor = Wav2Vec2Processor.from_pretrained(MODEL)
    return _processor

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
                _processor = Wav2Vec2Processor.from_pretrained(MODEL)
                _model = Wav2Vec2ForCTC.from_pretrained(MODEL).eval()
                _model.to(device)
                _feedback_model = Groq(api_key=os.environ.get("GROQ_API_KEY"))
                _device = device
    return _processor, _model, _feedback_model, _device

def _get_lesson(user_id, lesson_id):
    """Shared lookup used by both /api/lessons and /api/lessons/intro-video.

    IMPORTANT: lessons must be looked up by their "id" FIELD, never by raw
    array position. Lesson ids are 1-based strings ("1", "2", "3", ...)
    while the underlying list is 0-based, so `lessons[int(lesson_id)]` was
    silently fetching the *next* lesson's content (sentences AND video)
    for whatever lesson the user actually opened — id "1" (position 0)
    resolved to position 1 (id "2"), id "2" resolved to position 2 (id
    "3"), and so on. Matching on the "id" field is also what
    update_user_progress already does elsewhere, so this brings lookup in
    the two lesson-content endpoints in line with the rest of the app.

    Also centralizes what used to be an unguarded
    users_collection.find_one(...).get(...) with no None-check, which would
    500 on a bad user_id. This returns a proper 404/400 instead.
    """
    user = users_collection.find_one({"userId": user_id})
    if not user:
        return None, None, (jsonify({"error": "user not found"}), 404)

    lesson_id_str = str(lesson_id)
    lesson = next(
        (l for l in user.get('lessons', []) if str(l.get('id')) == lesson_id_str),
        None,
    )
    if lesson is None:
        return None, None, (jsonify({"error": "invalid lesson_id"}), 400)
    return user, lesson, None

@app.route('/api/lessons', methods=['GET', 'POST'])
def lessons():
    user_id = request.args.get('user_id')
    lesson_id = request.args.get('lesson_id')
    force_regenerate = request.args.get('regenerate') == 'true'

    user, lesson, err = _get_lesson(user_id, lesson_id)
    if err:
        return err

    word_list = lesson.get('words', [])

    cached = lesson.get('generated_content')
    if cached and not force_regenerate:
        logger.info("Lesson %s for user %s | serving cached generated content",
                    _sanitize_for_log(lesson_id), _sanitize_for_log(user_id))
        return jsonify(cached)

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
    if "sentences" in sentences and isinstance(sentences["sentences"], dict):
        sentences = sentences["sentences"]

    expected_ipas = []
    words_to_ipa_list = []
    try:
        for sentence in sentences.values():
            # Keep one (word, phonemes) pair per word *occurrence*, not per unique
            # word. A dict keyed by word (the old approach) silently collapsed
            # repeated words like "the cat sat on the mat" down to one "the"
            # entry, so the frontend only ever rendered/scored the first
            # occurrence's phonemes.
            words = sentence.split()
            sentence_phonemes = [(word, _word_to_phonemes(word)) for word in words]
            expected_ipas.append(sentence_phonemes)
            words_to_ipa_list.append(
                [{"word": w, "phonemes": p} for w, p in sentence_phonemes]
            )
    except Exception as e:
        print(f"IPA computation error: {e}")
        expected_ipas = []
        words_to_ipa_list = []

    target_phoneme = _resolve_target_phoneme(lesson, word_list)
    logger.info(
        "Lesson %s for user %s | words=%s target_phoneme=%r",
        _sanitize_for_log(lesson_id), _sanitize_for_log(user_id), word_list, target_phoneme,
    )

    generated_content = {
        "sentences": sentences,
        "expected_ipas": expected_ipas,
        "words_to_ipas": words_to_ipa_list,
        "words": word_list,
        "target_phoneme": target_phoneme,
    }

    users_collection.update_one(
        {"userId": user_id, "lessons.id": lesson_id},
        {"$set": {"lessons.$.generated_content": generated_content}}
    )

    return jsonify(generated_content)

@app.route('/api/lessons/intro-video', methods=['GET'])
def lesson_intro_video():
    """Resolved separately from /api/lessons so a video cache-miss never
    delays lesson start — see the comment above."""
    user_id = request.args.get('user_id')
    lesson_id = request.args.get('lesson_id')

    user, lesson, err = _get_lesson(user_id, lesson_id)
    if err:
        return err

    word_list = lesson.get('words', [])
    target_phoneme = _resolve_target_phoneme(lesson, word_list)

    intro_video_id = None
    if target_phoneme:
        try:
            intro_video_id = get_video_for_phoneme(
                target_phoneme, phoneme_video_cache, words=word_list
            )
        except Exception:
            logger.exception("Video lookup failed for phoneme %r", target_phoneme)

    return jsonify({
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

# Concrete tongue/lip/teeth/airflow placement cues per IPA phoneme, grounded in
# standard articulation-therapy descriptions. Used to keep generated feedback
# accurate instead of letting the LLM invent (and sometimes hallucinate)
# placement instructions. Both wav2vec2-timit style symbols (r, dʒ) and the
# CMU-derived symbols produced by arpabet_to_ipa (ɹ, ʤ, ə, etc.) are covered
# since either can show up depending on which path built the phoneme.
ARTICULATION_GUIDE = {
    "p": "Press both lips together, build up a little air behind them, then release with a small puff — no voice, just air.",
    "b": "Press both lips together like 'p', but buzz your voice as you release them.",
    "t": "Put the tip of your tongue right behind your top front teeth (on the bumpy ridge), then release it with a quick puff of air.",
    "d": "Same tongue spot as 't' — tip behind the top front teeth — but buzz your voice as you release.",
    "k": "Lift the back of your tongue to touch the roof of your mouth near your throat, then let go with a puff of air — no voice.",
    "g": "Same back-of-tongue spot as 'k', but add your voice as you release it.",
    "f": "Rest your top teeth gently on your bottom lip and blow air through the gap — no voice.",
    "v": "Same as 'f' — top teeth on bottom lip — but buzz your voice while the air flows.",
    "s": "Keep your teeth almost closed, tongue tip close behind your top teeth without touching, and push air out in a steady hiss down the middle of your tongue.",
    "z": "Same tongue and teeth position as 's', but turn your voice on so it buzzes instead of hisses.",
    "ʃ": "Round your lips a little, pull your tongue back slightly from the 's' spot, and push air out for a long 'shh'.",
    "ʒ": "Same mouth shape as 'ʃ', but add voice so it buzzes, like the middle sound in 'measure'.",
    "tʃ": "Start by touching your tongue tip to the ridge behind your top teeth like 't', then release straight into a 'ʃ' (shh) — one quick puff, no voice.",
    "dʒ": "Same tongue placement as 'tʃ', but voice it — start with a quick 'd' and release into a buzzing 'ʒ'.",
    "ʤ": "Same tongue placement as 'tʃ', but voice it — start with a quick 'd' and release into a buzzing 'ʒ'.",
    "m": "Press your lips together and hum the sound out through your nose.",
    "n": "Put your tongue tip behind your top front teeth like 't', close your mouth, and hum through your nose.",
    "ŋ": "Lift the back of your tongue to the same spot as 'k', but hum through your nose instead of releasing a puff — like the end of 'sing'.",
    "l": "Touch just the tip of your tongue to the ridge behind your top teeth and let your voice flow around the sides of your tongue.",
    "r": "Curl or bunch the middle of your tongue up and back without letting it touch the roof of your mouth, and round your lips slightly.",
    "ɹ": "Curl or bunch the middle of your tongue up and back without letting it touch the roof of your mouth, and round your lips slightly.",
    "w": "Round your lips into a small circle like you're about to whistle, then glide your tongue up toward the roof of your mouth as you voice it.",
    "j": "Start with the middle of your tongue raised close to the roof of your mouth, almost like 'ee', then glide into the next vowel.",
    "h": "Just breathe out a puff of air with your mouth shaped for the next vowel — no tongue contact at all.",
    "ð": "Put your tongue tip lightly between your top and bottom front teeth and buzz your voice as air slips past it, like 'that'.",
    "θ": "Same tongue-between-the-teeth spot as 'ð', but no voice — just a soft hiss of air, like 'think'.",
    "a": "Drop your jaw open wide and keep your tongue low and flat in your mouth, like starting to say 'ah'.",
    "ɑ": "Drop your jaw open wide and keep your tongue low and flat in your mouth, like starting to say 'ah'.",
    "æ": "Open your jaw and spread your lips slightly with your tongue low and forward, like the vowel in 'cat'.",
    "ʌ": "Relax your jaw halfway open with your tongue low and central, a short relaxed 'uh' like in 'cup'.",
    "ə": "Keep your mouth relaxed and barely open — the lazy, neutral 'uh' sound, like the 'a' in 'sofa'.",
    "e": "Raise the front of your tongue partway up with lips relaxed and slightly spread, like the vowel in 'bed'.",
    "ɛ": "Raise the front of your tongue partway up with lips relaxed and slightly spread, like the vowel in 'bed'.",
    "eɪ": "Start with your tongue mid-front like 'e', then glide the tongue up and forward toward 'ee' as you finish the sound.",
    "i": "Raise the front of your tongue high and forward, close to the roof of your mouth, with lips spread like a smile.",
    "ɪ": "Raise the front of your tongue high but relaxed, a little lower than 'ee', lips loosely spread, like the vowel in 'sit'.",
    "o": "Round your lips into a circle and raise the back of your tongue partway up, like the vowel in 'go'.",
    "ɔ": "Round your lips loosely and lower your jaw a bit more than 'o', tongue pulled back, like the vowel in 'saw'.",
    "oʊ": "Start with rounded lips and the back of your tongue raised like 'o', then glide your lips into a tighter circle toward 'oo'.",
    "ɔɪ": "Start with rounded lips like 'ɔ' (as in 'saw'), then glide your tongue up and forward toward 'ee'.",
    "u": "Round your lips tightly into a small circle and raise the back of your tongue high, like the vowel in 'moon'.",
    "ʊ": "Round your lips loosely and raise the back of your tongue high but relaxed, like the vowel in 'book'.",
    "aʊ": "Start with your jaw dropped open for 'ah', then glide your lips into a rounded circle as your tongue rises, like 'ow' in 'cow'.",
    "aɪ": "Start with your jaw dropped open for 'ah', then glide the front of your tongue up toward 'ee', like 'eye'.",
    "ɝ": "Bunch or curl your tongue up and back like 'r' while keeping your voice on the whole time, like the vowel in 'bird'.",
    "ɚ": "Bunch or curl your tongue up and back like 'r' while keeping your voice on the whole time, like the ending of 'butter'.",
}

DEFAULT_ARTICULATION_TIP = "Slow way down and exaggerate the sound so you can really feel where your tongue, lips, and teeth are while you make it."


def _aggregate_phoneme_scores(results):
    """Roll per-word phoneme scores up into per-phoneme stats across the whole
    sentence, so feedback can point at the single sound that most needs work
    instead of a somewhat-arbitrary slice of the raw (word, phoneme) pairs."""
    agg = {}
    for r in results:
        for p in r.get('phonemes', []):
            entry = agg.setdefault(p['phoneme'], {'total': 0.0, 'count': 0, 'words': []})
            entry['total'] += p['score']
            entry['count'] += 1
            entry['words'].append((r['word'], p['score']))
    return {
        phoneme: {
            'avg': v['total'] / v['count'],
            'count': v['count'],
            'words': v['words'],
        }
        for phoneme, v in agg.items()
    }


def _generate_detailed_feedback(results, target_phoneme, avg, baseline=None):
    """Build speech-therapy-grade feedback: pick the single sound that most
    needs work (favoring the lesson's target phoneme when it's still weak),
    look up a real articulation cue for it, and have the model phrase that
    into one encouraging, kid-facing explanation — rather than letting the
    model invent its own (possibly wrong) mouth-placement advice.

    Returns a dict with both the prose ('text') and the structured facts
    behind it, so the frontend can persist/rank feedback across a lesson
    without having to re-parse prose.
    """
    baseline = baseline or {}
    agg = _aggregate_phoneme_scores(results)
    if not agg:
        return {'text': "Hmm, try again.", 'phoneme': None, 'word': None, 'score': None, 'tip': None}

    if target_phoneme and target_phoneme in agg and agg[target_phoneme]['avg'] < 0.8:
        weak_phoneme = target_phoneme
    else:
        weak_phoneme = min(agg, key=lambda p: agg[p]['avg'])

    weak_word, weak_word_score = min(agg[weak_phoneme]['words'], key=lambda t: t[1])
    tip = ARTICULATION_GUIDE.get(weak_phoneme, DEFAULT_ARTICULATION_TIP)

    trend = ""
    base_score = baseline.get(weak_phoneme)
    if base_score is not None:
        delta = agg[weak_phoneme]['avg'] - base_score
        if delta > PHONEME_DELTA_MARGIN:
            trend = f"Note: this is actually an improvement over their usual {base_score:.2f} average on this sound — mention they're making progress."
        elif delta < -PHONEME_DELTA_MARGIN:
            trend = f"Note: this is below their usual {base_score:.2f} average on this sound."

    word_summary = ", ".join(f"{r['word']} ({r['score']:.2f})" for r in results)

    prompt = f"""
    You are a licensed speech-language pathologist giving feedback to a child right
    after a speech therapy practice sentence. The lesson is drilling the "{target_phoneme}" sound.
    Overall sentence accuracy: {avg:.2f} (out of 1.0).
    Per-word scores: {word_summary}
    The sound that most needs work right now is /{weak_phoneme}/, heard weakest in
    the word "{weak_word}" (score {weak_word_score:.2f}).
    Correct articulation for /{weak_phoneme}/: {tip}
    {trend}

    Write feedback for the child, at most two short sentences, that:
    - Names the word and the /{weak_phoneme}/ sound specifically
    - Explains what to do with their tongue, lips, or teeth, using simple kid-friendly
      language based ONLY on the articulation description above — do not invent a
      different technique
    - Avoids generic phrases like "try again" or "good job"
    """
    try:
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
        )
        text = chat_completion.choices[0].message.content.strip()
    except Exception:
        logger.exception("Groq feedback generation failed")
        text = f"Let's work on the /{weak_phoneme}/ sound in \"{weak_word}\": {tip}"

    return {
        'text': text,
        'phoneme': weak_phoneme,
        'word': weak_word,
        'score': weak_word_score,
        'tip': tip,
    }

def finalize_session(sid):
    session = sessions.pop(sid, None)
    if not session:
        return
    results = session['results']
    target_phoneme = session.get('target_phoneme')

    phoneme_scores = [p for r in results for p in r['phonemes']]
    if phoneme_scores:
        weighted_sum = 0.0
        weight_total = 0.0
        for p in phoneme_scores:
            weight = TARGET_PHONEME_WEIGHT if p['phoneme'] == target_phoneme else 1.0
            weighted_sum += p['score'] * weight
            weight_total += weight
        avg = weighted_sum / weight_total
    else:
        avg = 0.0
    if avg >= 0.8:
        feedback_detail = {'text': "Great job!", 'phoneme': None, 'word': None, 'score': None, 'tip': None}
    else:
        feedback_detail = _generate_detailed_feedback(results, target_phoneme, avg, session.get('baseline'))
    socketio.emit('result', {
        'score': avg,
        'passed': avg >= 0.8,
        'feedback': feedback_detail['text'],
        'feedback_detail': feedback_detail,
        'res': results,
    }, to=sid)

@socketio.on('connect')
def handle_connect(auth=None):
    print(f"Client connected: {request.sid}")

@socketio.on('start')
def handle_start(data):
    sid = request.sid
    words_ipa = data['words_ipa']
    user_id = data.get('userId')

    baseline = {}
    if user_id:
        user = users_collection.find_one({"userId": user_id}, {"progress.phonemeScores": 1})
        if user:
            for entry in user.get("progress", {}).get("phonemeScores", []):
                if entry.get("avgScore") is not None:
                    baseline[entry["phoneme"]] = entry["avgScore"]

    flat_phonemes = [p for w in words_ipa for p in w['phonemes']]
    position_to_word_idx = [
        word_idx
        for word_idx, w in enumerate(words_ipa)
        for _ in w['phonemes']
    ]
    word_start_position = []
    _pos = 0
    for w in words_ipa:
        word_start_position.append(_pos)
        _pos += len(w['phonemes'])
    chunk_queue = queue.Queue()
    mode = data.get('mode', 'audio')
    sentence = data.get('sentence', '')
    target_phoneme = data.get('target_phoneme')
    session = {'words_ipa': words_ipa, 'queue': chunk_queue, 'results': [],
               'mode': mode, 'audio': [], 'target_phoneme': target_phoneme,
               'baseline': baseline}
    sessions[sid] = session

    def run():
        word_phoneme_scores = [[None] * len(w['phonemes']) for w in words_ipa]
        word_completed = [False] * len(words_ipa)
        stream_ended = False

        def drain():
            nonlocal stream_ended
            while (item := chunk_queue.get()) is not None:
                yield item
            stream_ended = True

        try:
            if mode == 'logits':
                processor = _load_processor_once()
                matches = stream_decode_logits(drain(), flat_phonemes, processor.tokenizer)
            else:
                processor, model, _, device = _load_model_once()
                matches = stream_decode_util(drain(), flat_phonemes, processor, model, device)

            for match in matches:
                if match['label'] == 'insertion' or match['position'] is None:
                    continue
                word_idx = position_to_word_idx[match['position']]
                if word_completed[word_idx]:
                    continue
                local_idx = match['position'] - word_start_position[word_idx]
                word_entry = words_ipa[word_idx]
                if not (0 <= local_idx < len(word_entry['phonemes'])):
                    continue
                word_phoneme_scores[word_idx][local_idx] = {'phoneme': match['phoneme'], 'decoded': match['decoded'], 'score': match['score']}
                if all(s is not None for s in word_phoneme_scores[word_idx]):
                    word_completed[word_idx] = True
                    scores = word_phoneme_scores[word_idx]
                    word_score = sum(p['score'] for p in scores) / len(scores)
                    result = {
                        'word_index': word_idx,
                        'word': word_entry['word'],
                        'phonemes': scores,
                        'score': word_score,
                    }
                    session['results'].append(result)
                    socketio.emit('partial_result', result, to=sid)

                    phoneme_deltas = []
                    for entry in scores:
                        ph = entry['phoneme']
                        base = baseline.get(ph)
                        delta = None if base is None else entry['score'] - base
                        if delta is None:
                            status = 'new'
                        elif delta > PHONEME_DELTA_MARGIN:
                            status = 'improved'
                        elif delta < -PHONEME_DELTA_MARGIN:
                            status = 'worse'
                        else:
                            status = 'steady'
                        phoneme_deltas.append({
                            'phoneme': ph,
                            'score': entry['score'],
                            'baseline': base,
                            'delta': delta,
                            'status': status,
                        })

                    socketio.emit('stats_update', {
                        'word_index': word_idx,
                        'word': word_entry['word'],
                        'score': word_score,
                        'is_strike': word_score < WORD_FAIL_SCORE_THRESHOLD,
                        'phoneme_deltas': phoneme_deltas,
                    }, to=sid)

            if not stream_ended:
                for _ in drain():
                    pass
        except Exception:
            logger.exception("Stream decode failed")
        finally:
            finalize_session(sid)

        if session['audio']:
            try:
                event = prosody_event(np.concatenate(session['audio']), sentence)
                socketio.emit('prosody', {k: event[k] for k in
                                          ('monotony_score', 'rhythm_score',
                                           'boundary_score', 'speaking_rate')}, to=sid)
            except Exception:
                logger.exception("Prosody evaluation failed")

    threading.Thread(target=run, daemon=True).start()
    print(f"Session started for {sid}: {data['sentence']}")

@socketio.on('chunk')
def handle_chunk(data):
    session = sessions.get(request.sid)
    if not session:
        return
    arr = np.frombuffer(data, dtype=np.float32)
    session['audio'].append(arr)
    if session.get('mode') != 'logits':
        session['queue'].put(arr)

@socketio.on('logits_chunk')
def handle_logits_chunk(data):
    """Receive precomputed wav2vec2 logits for one audio chunk.
    Payload: {'frames': int, 'data': float32 bytes of shape (frames, vocab)}."""
    session = sessions.get(request.sid)
    if not session or session.get('mode') != 'logits':
        return
    try:
        frames = int(data.get('frames', 0))
        arr = np.frombuffer(data['data'], dtype=np.float32)
    except (TypeError, KeyError, ValueError):
        return
    if frames <= 0 or arr.size == 0 or arr.size % frames != 0:
        return
    session['queue'].put(arr.reshape(frames, -1))

@socketio.on('stop')
def handle_stop():
    session = sessions.get(request.sid)
    if session:
        session['queue'].put(None)

@socketio.on('disconnect')
def handle_disconnect():
    session = sessions.pop(request.sid, None)
    if session:
        session['queue'].put(None)

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
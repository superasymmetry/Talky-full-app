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
from stream_decode_util import stream_decode_util, stream_decode_logits, prosody_event, normalize
from prosody_eval import warmup_async

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


# Any request that sends a custom header (our Authorization: Bearer ...
# header counts) triggers a CORS preflight OPTIONS request from the
# browser first. Flask/Werkzeug is supposed to auto-handle OPTIONS on any
# registered route, but that was 404ing here for routes like
# /api/user/roster even though the GET on the exact same path worked fine
# — the browser then blocks the real request entirely since the preflight
# failed. This unconditionally answers every OPTIONS request before
# routing/404 logic gets a chance to run, and flask-cors's after_request
# hook still attaches the correct Access-Control-* headers on the way out.
@app.before_request
def _handle_cors_preflight():
    if request.method == "OPTIONS":
        return app.make_default_options_response()


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

# pyin's first call pays a ~10 s numba JIT compile that doesn't persist across
# restarts; trigger it at boot so no lesson ever waits on it.
warmup_async()

sessions = {}

# --- Lesson performance / "hearts" config -----------------------------------
# A word scoring below this counts as a "strike" toward the lesson's early
# cutoff. The actual lives counter is tracked lesson-wide on the frontend
# (each sentence gets a brand-new session dict here, so a lives count kept
# server-side would reset every sentence instead of persisting across the
# whole lesson) — this constant just tells the frontend which words count
# against the player.
WORD_FAIL_SCORE_THRESHOLD = 0.5

# How big a gap between a phoneme's score-this-attempt and the user's
# historical average for that phoneme counts as a meaningful improvement or
# regression, vs. just noise.
PHONEME_DELTA_MARGIN = 0.05

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

    # Serve previously-generated content unchanged instead of hitting the
    # LLM + re-tokenizing IPA on every page load — a lesson's sentences
    # don't need to be different each time someone opens it.
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
            sentence_phonemes = collections.OrderedDict()
            for word in sentence.split():
                sentence_phonemes[word] = _word_to_phonemes(word)
            expected_ipas.append(sentence_phonemes)
            words_to_ipa_list.append(
                [{"word": w, "phonemes": p} for w, p in sentence_phonemes.items()]
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
        "target_phoneme": target_phoneme,
    }

    # Persist so the next load of this exact lesson skips the LLM call and
    # the IPA computation loop entirely.
    #
    # Matched by the lesson's "id" FIELD (positional operator "$"), not by
    # treating lesson_id as an array index — see _get_lesson above for why
    # that distinction matters. Using `lessons.{lesson_id}.generated_content`
    # here previously wrote the cached content onto the WRONG array slot
    # for the same reason _get_lesson was reading the wrong slot.
    users_collection.update_one(
        {"userId": user_id, "lessons.id": lesson_id},
        {"$set": {"lessons.$.generated_content": generated_content}}
    )

    # Note: video lookup is intentionally NOT done here — see
    # /api/lessons/intro-video below. Bundling it into this response means a
    # cache-miss YouTube call blocks the sentences/IPA the player actually
    # needs to start, even though the video is just decoration on the intro
    # screen.
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

def finalize_session(sid):
    session = sessions.pop(sid, None)
    if not session:
        return
    results = session['results']
    # NOTE: this used to be `len(results) / total_words` — i.e. "fraction of
    # words attempted", not an accuracy score, so a lesson where every word
    # scored 0.1 would still report "100%" once all words were attempted.
    # This is the number the whole lesson-performance feature depends on, so
    # it needs to actually be the average word score.
    avg = sum(r['score'] for r in results) / len(results) if results else 0.0
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
    user_id = data.get('userId')

    # Pull this user's historical per-phoneme averages once per sentence
    # attempt, so we can tell them "better/worse than usual" on each
    # phoneme live, not just a bare per-word pass/fail. Best-effort: if no
    # userId is sent, or the user has no scored phonemes yet, deltas just
    # come back None/"new" for everything below.
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
    chunk_queue = queue.Queue()
    # mode 'audio': client streams raw 16 kHz PCM, wav2vec2 runs server-side.
    # mode 'logits': client already ran wav2vec2 (e.g. transformers.js on WebGPU)
    #                and streams per-chunk logits; only alignment runs here.
    #                The client also streams the raw audio so prosody can still
    #                be scored server-side (see handle_chunk).
    mode = data.get('mode', 'audio')
    sentence = data.get('sentence', '')
    session = {'words_ipa': words_ipa, 'queue': chunk_queue, 'results': [],
               'mode': mode, 'audio': []}
    sessions[sid] = session

    def run():
        word_phoneme_scores = [[] for _ in words_ipa]
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
                word_phoneme_scores[word_idx].append({'phoneme': match['phoneme'], 'score': match['score']})
                word_entry = words_ipa[word_idx]
                if len(word_phoneme_scores[word_idx]) == len(word_entry['phonemes']):
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

                    # Per-phoneme delta vs. this user's historical baseline, plus
                    # whether this word counts as a "strike". The lesson-wide
                    # lives count and running accuracy are accumulated on the
                    # frontend across all sentences in the lesson — see Lesson.jsx.
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

            # Alignment can finish before the speaker does — wait for the
            # stream to end ('stop' or disconnect) so the result isn't sent
            # mid-recording and prosody sees the full utterance.
            if not stream_ended:
                for _ in drain():
                    pass
        except Exception:
            logger.exception("Stream decode failed")
        finally:
            # The word-score result must go out even if decode blew up, and
            # before prosody: pyin can take seconds, and the main score
            # shouldn't wait on it.
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
    # Raw audio is buffered in both modes so prosody can be evaluated over the
    # full utterance after the word-score result goes out; in audio mode it
    # additionally drives alignment via the queue.
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
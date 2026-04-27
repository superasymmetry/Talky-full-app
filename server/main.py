import collections
import eng_to_ipa as ipa
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
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
from g2p_en import G2p
import json
import nltk
nltk.download('cmudict')

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

def eval_phonemes(audio_path, expected_text, expected_ipa):
    processor, model, feedback_model = _load_model_once()
    audio_input, sample_rate = sf.read(audio_path)
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)

    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits
    probs = torch.nn.functional.softmax(logits, dim=-1)[0].cpu().numpy()
    print("probs shape", probs.shape)
    print("probs", probs)
    predicted_ids = torch.argmax(logits, axis=-1)      
    predicted_sentences = processor.batch_decode(predicted_ids)
    print("predicted", predicted_sentences)

    id2phoneme = list(processor.tokenizer.get_vocab().keys())
    phoneme2id = {p: i for i, p in enumerate(id2phoneme)}

    # expected ipa is something like: ['DH', 'AH0', 'K', 'W', 'IH1', 'B', 'R', 'AW1', 'N', 'F', 'AA1', 'X', 'JH', 'AH0', 'M', 'P', 'S']
    # want to convert to ipa symbols
    clean_expected_ipa = ipa.convert(expected_text).split()
    clean_expected_ipa = [p for p in clean_expected_ipa if p.isalpha() or p.isalnum()]
    
    # Compute phoneme goodness score
    phoneme_err = 0
    T, N = probs.shape[0], len(clean_expected_ipa)
    frame_splits = np.array_split(np.arange(T), N)
    phoneme_scores = []
    for i, p in enumerate(clean_expected_ipa):
        frames = frame_splits[i]
        if len(frames) == 0:
            phoneme_scores.append({'phoneme': p, 'score': 0.0})
            continue
        idx = phoneme2id.get(p, None)
        if idx is not None:
            expected_probs = probs[frames, idx]
            margin = expected_probs - np.partition(probs[frames, :], -2, axis=-1)[:, -2]
            score = float(np.mean(margin))
            phoneme_scores.append({'phoneme': p, 'score': score})
        else:
            phoneme_scores.append({'phoneme': p, 'score': 0.0})
        print("phoneme, score", p, phoneme_scores[-1]['score'])

    if phoneme_err < 100:
        feedback = "Great, you've completed this sentence! Go on."
    else:
        _feedback_prompt = f"This is the transcription of a spoken sentence that I spoke: '{predicted_sentences[0]}'. The expected sentence was: '{expected_text}'. Based on common speech impediments (r, w, l, th, f, s, v, b, ch, sh sounds), please deduce which sounds were mispronounced, as well as the words that were mispronounced, and provide me constructive feedback on how to improve the pronunciation. Output one short sentence of feedback and ONLY the one short sentence."
        feedback = _feedback_model.chat.completions.create(
            messages=[{"role": "user", "content": _feedback_prompt}],
            model="llama-3.1-8b-instant",
        ).choices[0].message.content.strip()
        feedback = "Hmm, try again. " + feedback
    return (predicted_sentences[0], feedback, phoneme_err, expected_ipa)

def get_phoneme_scores(input_audio, expected_sentence):
    """Evaluate phoneme accuracy of input audio against expected sentence.
    Args:
        input_audio (str): Path to the input audio file.
        expected_sentence (str): The expected sentence in text form.
    Returns:
        phoneme_scores (list): List of dictionaries with phoneme and its score.
        e.g. [{'word': 'the', 'phonemes': [{'phoneme': 'ð', 'score': 0.9}, {'phoneme': 'ə', 'score': 0.8}]}, ...]
    """
    expected_sentence = expected_sentence.rstrip('.')

    # Load pre-trained model and processor
    processor = Wav2Vec2Processor.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16)
    model = Wav2Vec2ForCTC.from_pretrained("vitouphy/wav2vec2-xls-r-300m-timit-phoneme", dtype=torch.float16).eval()
    model.to(device)

    # Read and process the input audio
    audio_input, sample_rate = sf.read(input_audio)
    inputs = processor(audio_input, sampling_rate=16_000, return_tensors="pt", padding=True).to(device).to(torch.float16)
    with torch.no_grad():
        logits = model(inputs.input_values, attention_mask=inputs.attention_mask).logits
    log_probs = torch.nn.functional.log_softmax(logits, dim=-1)[0].cpu().numpy()
    probs = torch.nn.functional.softmax(logits, dim=-1)[0].cpu().numpy()
    id2phoneme = list(processor.tokenizer.get_vocab().keys())
    phoneme2id = {p: i for i, p in enumerate(id2phoneme)}

    # Convert expected sentence to IPA phonemes
    converted_ipa = ipa.convert(expected_sentence)
    words_ipa = converted_ipa.split()
    expected_ipa = converted_ipa.replace(" ", "")
    expected_ipa = [c for c in expected_ipa if c in phoneme2id]
    print("expected ipa", expected_ipa)
    if len(expected_ipa) == 0:
        return [{'word': expected_sentence, 'phonemes': []}], 0.0

    # Convert expected IPA to indices
    target = [phoneme2id[p] for p in expected_ipa]
    T, N = log_probs.shape[0], len(target)

    # Viterbi forced alignment
    trellis = np.full((T + 1, N + 1), -np.inf, dtype=np.float32)
    trellis[0, 0] = 0
    for t in range(T):
        for n in range(N + 1):
            # Stay at current phoneme
            if n < N:
                trellis[t + 1, n] = np.logaddexp(trellis[t + 1, n], trellis[t, n] + log_probs[t, target[n]])
            # Move to next phoneme
            if n > 0 and n <= N:
                trellis[t + 1, n] = np.logaddexp(trellis[t + 1, n], trellis[t, n - 1] + log_probs[t, target[n - 1]])

    # Backtrack to get alignment
    t, n = T, N
    path = []
    while t > 0 and n > 0:
        p_stay = trellis[t - 1, n] + log_probs[t - 1, target[n - 1]]
        p_move = trellis[t - 1, n - 1] + log_probs[t - 1, target[n - 1]]
        if n > 0 and p_move >= p_stay:
            path.append((t - 1, n - 1))
            t -= 1
            n -= 1
        else:
            path.append((t - 1, n - 1))
            t -= 1
    path = path[::-1]

    # Assign frames to phonemes
    phoneme_frames = [[] for _ in range(N)]
    for t_idx, n_idx in path:
        if n_idx < N:
            phoneme_frames[n_idx].append(t_idx)
    # phoneme frames looks something like: [[1, 2, 3], [4], [5], [6, 7, 8, 9, 10...], ...]

    # Compute scores
    probs = np.exp(log_probs)
    phoneme_scores = []
    total_score = 0.0
    num_scores = 0
    for i, frame_idxs in enumerate(phoneme_frames):
        p = expected_ipa[i]
        max_probs = np.max(probs[frame_idxs, :], axis=1)
        second_max_probs = np.partition(probs[frame_idxs, :], -2, axis=1)[:, -2]
        score = float(np.mean(max_probs - second_max_probs))
        total_score += score
        num_scores += 1
        phoneme_scores.append({'phoneme': p, 'score': score})
    
    print("phoneme scores", phoneme_scores)
    res = []
    words = expected_sentence.split()
    for i, pword in enumerate(words_ipa):
        phonemes = []
        for char in pword:
            if phoneme_scores:
                if char == phoneme_scores[0]['phoneme']:
                    phonemes.append(phoneme_scores.pop(0))
        res.append({'word': words[i], 'phonemes': phonemes})
    print("res", res)
    avg_score = total_score / num_scores
    print("avg score", avg_score)

    return res, avg_score

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
        g2p = G2p()
        for sentence in sentences.values():
            sentence_phonemes = collections.OrderedDict()
            for word in sentence.split():
                raw_phonemes = [p for p in g2p(word) if p != ' ']
                raw_phonemes = [p for p in raw_phonemes if p.isalpha() or p.isalnum()]
                phonemes = [arpabet_to_ipa[p] for p in raw_phonemes if p in arpabet_to_ipa]
                print("word, phonemes", word, phonemes)
                sentence_phonemes[word] = phonemes
            expected_ipas.append(sentence_phonemes)
            words_to_ipa = [{"word": word, "phonemes": phonemes} for word, phonemes in sentence_phonemes.items()]
            words_to_ipa_list.append(words_to_ipa)
    except Exception as e:
        print(f"IPA computation error: {e}")
        expected_ipas = []
        words_to_ipa_list = []
    return jsonify({"sentences": sentences, "expected_ipas": expected_ipas, "words_to_ipas": words_to_ipa_list})

@app.route('/api/record', methods=['POST', 'GET'])
def backend_record():
    '''For API call in Lesson.jsx: records audio, computes pronunciation score, and returns feedback
        Inputs: JSON with "card" field (sentence to be spoken)
        Returns: JSON with "score", "feedback", "passed", "transcription", and "reference" fields
    '''
    if request.method == 'POST':
        sentence = request.get_json()['card']
        expected_ipa = request.get_json()['expected_ipa']
        filename = pyaudio_recording.record_audio(record_seconds=4)
        # transcription, feedback, score, _ = eval_phonemes(filename, sentence, expected_ipa)
        res, score = get_phoneme_scores(filename, sentence)
        feedback = "Great job!" if score > 0.8 else "Hmm, try again."
        return jsonify({"score": score, "feedback": feedback, "passed": score > 0.8, "reference": sentence, "res": res}), 200

@app.route('/api/record/test', methods=['POST'])
def backend_record_test():
    audio_file = request.files['audio']
    sentence = request.form.get('card')
    os.makedirs("testfiles", exist_ok=True)
    audio_file.save("testfiles/uploaded_test.wav")
    res, score = get_phoneme_scores("testfiles/uploaded_test.wav", sentence)
    feedback = "Great job!" if score > 0.8 else "Hmm, try again."
    return jsonify({"score": score, "feedback": feedback, "passed": score > 0.8, "reference": sentence, "res": res}), 200

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

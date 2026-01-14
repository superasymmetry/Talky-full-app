from flask import Blueprint, request, jsonify, g
from database import users_collection
from datetime import datetime
from groq import Groq
from auth import requires_auth
import os
import random

user_bp = Blueprint("user_bp", __name__)

# Default categories for new users
DEFAULT_PHONEMES = ["l", "r", "s", "th", "ch", "sh"]  # add more as needed
DEFAULT_POSITIONS = ["initial", "medial", "final"]
DEFAULT_SOUND_TYPES = ["plosive", "fricative", "nasal", "liquid", "glide", "vowel"]
DEFAULT_SYLLABLES = [1, 2, 3]  # word length

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

@user_bp.route("/api/user/adduser", methods=["GET", "POST"])
def adduser():
    '''For initializing a user in mongodb database: inserts initial user document
        Inputs: None
        Returns: JSON object of user document
    '''
    data = request.get_json()
    user_id = data.get("userId")
    name = data.get("name", "")
    
    existing_user = users_collection.find_one({"userId": user_id})
    if existing_user:
        print(f"User {user_id} already exists")
        return jsonify({"message": "User already exists", "userId": user_id}), 200
    
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
        "lessons": [
            {"id": "1", "phoneme": "r", "words": ["rainbow", "racecar"], "score": 0},
            {"id": "2", "phoneme": "r", "words": ["red", "read"], "score": 0},
            {"id": "game", "phoneme": "l", "words": ["lion", "leaf"], "score": 0},
            {"id": "3", "phoneme": "l", "words": ["lion", "leaf"], "score": 0},
            {"id": "4", "phoneme": "l", "words": ["letter", "learn"], "score": 0},
        ]
    }
    users_collection.insert_one(user_doc)
    print("added user,", user_doc)
    return jsonify(user_doc)

@user_bp.route("/api/user/progress", methods=["GET", "POST"])
def get_user_progress_weakness():
    '''For getting user's weaknesses: retrieves user's phoneme scores from database
        Inputs: user_id (string)
        Returns: JSON of phonemeScores
    '''
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"progress.phonemeScores": 1})
    
    if not user or "progress" not in user:
        return jsonify({"error": "User not found or progress data missing"}), 404
    
    return jsonify({"phonemeScores": user["progress"].get("phonemeScores", [])})


@user_bp.route("/api/user/history", methods=["GET", "POST"])
def get_user_history():
    '''For viewing user's history: retrieves user's history data from database
        Inputs: user_id (string)
        Returns: JSON of history
    '''
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"history": 1})
    if not user or "history" not in user:
        return jsonify({"error": "User not found or history data missing"}), 404
    return jsonify({"history": user["history"]})


@user_bp.route("/api/user/lessons", methods=["GET", "POST"])
def get_user_lessons():
    '''For determining which lessons have been completed: retrieves user's lessons data from database
        Inputs: user_id (string)
        Returns: JSON array of lessons in order
    '''
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"lessons": 1, "_id": 0})
    if not user or "lessons" not in user:
        return jsonify({"error": "User not found or lessons data missing"}), 404
    return jsonify({"lessons": user["lessons"]})


@user_bp.route('/api/generatenextlesson', methods=['GET', 'POST'])
def generatenextlesson():
    '''For generating the next lesson based on user's weaknesses when current lesson completes:
        Updates lessons field in database with new lesson
        Inputs: user_id (string)
        Returns: JSON of new lesson data
    '''
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    
    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    lesson_keys = [k for k in user['lessons'].keys() if str(k).isdigit()]
    lastlesson_id = max([int(k) for k in lesson_keys]) if lesson_keys else 0
    next_lesson_id = str(lastlesson_id + 1)
    
    ps = user['progress']['phonemeScores']
    valid_scores = [(i, p['avgScore']) for i, p in enumerate(ps) if p.get('avgScore') is not None]
    
    if not valid_scores:
        return jsonify({"error": "No phoneme scores available"}), 400
    
    min_idx = min(valid_scores, key=lambda x: x[1])[0]
    weakest_phoneme = ps[min_idx]['phoneme']
    words = random.sample(phoneme_word_bank.get(weakest_phoneme, ["practice", "word"]), k=2)
    
    new_lesson = {f"lessons.{next_lesson_id}": {
            "phoneme": weakest_phoneme,
            "words": words,
            "score": 0
        }}
    users_collection.update_one(
        {"userId": user_id},
        {"$set": new_lesson}
    )
    return jsonify(new_lesson), 200

@user_bp.route("/api/getUserProfile", methods=["GET"])
def get_user_profile():
    token_payload = getattr(g, "current_user", {}) or {}
    user_id = token_payload.get("sub") or request.args.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId"}), 400

    user = users_collection.find_one({"userId": user_id}, {"_id": 0})
    if not user:
        return jsonify({"message": "User not found"}), 404
    return jsonify(user)

@user_bp.route("/api/getUserProgress", methods=["GET"])
def get_user_progress():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId parameter"}), 400

    user = users_collection.find_one({"userId": user_id}, {"_id": 0})
    if not user:
        return jsonify({"message": "User not found"}), 404

    return jsonify({
        "userId": user["userId"],
        "name": user["name"],
        "progress": user["progress"],
        "history": user["history"],
    })

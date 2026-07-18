from flask import Blueprint, request, jsonify, g
from database import users_collection
from datetime import datetime, timezone
from groq import Groq
from auth import requires_auth
import os
import random

user_bp = Blueprint("user_bp", __name__)

USER_ID_REQUIRED = "user_id is required"

VALID_ROLES = {"Student", "Teacher"}


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

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


def _default_user_doc(user_id, name=""):
    '''Full default schema for a brand-new user. Shared by adduser (legacy
    explicit-create path) and the auto-provisioning in getUserProfile /
    updateUserProfile, so a user is never left with a partial document
    missing fields other routes (lessons, progress, history) depend on.'''
    phonemes = ["l", "r", "p", "b", "t", "d", "k", "g", "f", "v", "s", "z",
                "ʃ", "sh", "ʒ", "tʃ", "ch", "dʒ", "j", "m", "n", "ŋ", "w", "y",
                "a", "e", "i", "o", "u"]
    phoneme_scores = [{"phoneme": ph, "avgScore": None, "attempts": None} for ph in phonemes]
    initial_history = dict.fromkeys(phonemes, 0)
    initial_history["timestamp"] = _utc_now_iso()

    return {
        "userId": user_id,
        "name": name,
        "nickname": "",
        "age": None,
        "role": "Student",
        "progress": {
            "phonemeScores": phoneme_scores,
            "wordScores": []
        },
        "history": [initial_history],
        "lessons": [
            {"id": "1", "phoneme": "r", "words": ["rainbow", "racecar"], "score": 0},
            {"id": "2", "phoneme": "r", "words": ["red", "read"], "score": 0},
            {"id": "3", "phoneme": "l", "words": ["lion", "leaf"], "score": 0},
            {"id": "4", "phoneme": "l", "words": ["letter", "learn"], "score": 0},
        ],
        "level": {"current": 1, "subpoints": 20, "maxval": 100},
        "maxLessonId": 4
    }


@user_bp.route("/api/user/adduser", methods=["POST"])
@requires_auth
def adduser():
    '''For initializing a user in mongodb database: inserts initial user document.
        userId comes from the verified token (not the request body) so a
        caller can't create/overwrite an arbitrary userId — same rule as
        getUserProfile/updateUserProfile below.
        Inputs: JSON body with optional "name"
        Returns: JSON object of user document
    '''
    data = request.get_json(silent=True) or {}
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401
    name = data.get("name", "")

    existing_user = users_collection.find_one({"userId": user_id})
    if existing_user:
        return jsonify({"message": "User already exists", "userId": user_id}), 200

    user_doc = _default_user_doc(user_id, name=name)
    users_collection.insert_one(user_doc.copy())
    return jsonify(user_doc)

@user_bp.route("/api/user/get_level", methods=["GET", "POST"])
def get_user_level():
    '''For getting user's level: retrieves user's level field form mongodb
        Inputs: user_id (string)
        Returns: JSON of level
    '''
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    user = users_collection.find_one({"userId": user_id}, {"level": 1})
    if not user or "level" not in user:
        return jsonify({"error": "User not found or level data missing"}), 404
    return jsonify({"level": user["level"]})

@user_bp.route("/api/user/progress", methods=["GET", "POST"])
def get_user_progress_weakness():
    '''For getting user's weaknesses: retrieves user's phoneme scores from database
        Inputs: user_id (string)
        Returns: JSON of phonemeScores
    '''
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
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
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
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
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"lessons": 1, "_id": 0})
    if not user or "lessons" not in user:
        return jsonify({"error": "User not found or lessons data missing"}), 404
    return jsonify({"lessons": user["lessons"]})


@user_bp.route('/api/user/generatenextlesson', methods=['GET', 'POST'])
def generatenextlesson():
    '''For generating the next lesson based on user's weaknesses when current lesson completes:
        Updates lessons field in database with new lesson
        Inputs: user_id (string)
        Returns: JSON of new lesson data
    '''
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    currentLessonId = data.get("currentLessonId")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400

    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"error": "User not found"}), 404
    maxLessonId = user.get("maxLessonId", 0)
    
    print("currentLessonId, maxLessonId", currentLessonId, maxLessonId)
    if not (currentLessonId == maxLessonId - 1):
        return jsonify({"message": "Not eligible for new lesson yet"}), 400
    else:
        next_lesson_id = str(maxLessonId + 1)
        ps = user['progress']['phonemeScores']
        lowest = float('inf')
        weakest_phoneme = 'r'
        for phoneme_object in ps:
            if not phoneme_object['avgScore']:
                weakest_phoneme = phoneme_object['phoneme']
                break
            if phoneme_object['avgScore'] < lowest:
                lowest = phoneme_object['avgScore']
                weakest_phoneme = phoneme_object['phoneme']

        words = random.sample(phoneme_word_bank.get(weakest_phoneme, ["practice", "word"]), k=2)
        
        new_lesson = {f"lessons.{next_lesson_id}": {
                "id": next_lesson_id,
                "phoneme": weakest_phoneme,
                "words": words,
                "score": 0
            }}
        users_collection.update_one(
            {"userId": user_id},
            {"$set": new_lesson}
        )
        users_collection.update_one(
            {"userId": user_id},
            {"$set": {"maxLessonId": maxLessonId + 1}}
        )
        return jsonify(new_lesson), 200

@user_bp.route("/api/getUserProfile", methods=["GET"])
@requires_auth
def get_user_profile():
    # requires_auth guarantees g.current_user is set (it 401s before this
    # runs otherwise), so the token's sub is always the source of truth —
    # the userId query param is no longer trusted.
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    user = users_collection.find_one({"userId": user_id}, {"_id": 0})
    if not user:
        # First time this user has ever hit the API — provision their doc
        # now instead of 404ing. The frontend used to call a separate
        # "create user" step before this fetch, but that call was never
        # wired up, so no document ever existed and every subsequent save
        # failed with "User not found".
        user = _default_user_doc(user_id)
        users_collection.insert_one(user.copy())
    return jsonify(user)


@user_bp.route("/api/updateUserProfile", methods=["POST"])
@requires_auth
def update_user_profile():
    '''For saving editable profile fields: upserts nickname/age/role onto the user document
        Inputs: JSON body with any of nickname/age/role; userId comes from the auth token
        Returns: JSON of the fields that were updated
    '''
    data = request.get_json() or {}

    # userId comes from the verified token, never from the request body —
    # otherwise any logged-in user could overwrite any other user's
    # profile just by changing the userId field in the payload.
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    update_fields = {}

    if "nickname" in data:
        nickname = data.get("nickname")
        if nickname is not None and not isinstance(nickname, str):
            return jsonify({"message": "nickname must be a string"}), 400
        update_fields["nickname"] = (nickname or "").strip()

    if "age" in data:
        try:
            age = int(data.get("age"))
        except (TypeError, ValueError):
            return jsonify({"message": "age must be a number"}), 400
        if age < 1 or age > 120:
            return jsonify({"message": "age must be between 1 and 120"}), 400
        update_fields["age"] = age

    if "role" in data:
        role = data.get("role")
        if role not in VALID_ROLES:
            return jsonify({"message": f"role must be one of {sorted(VALID_ROLES)}"}), 400
        update_fields["role"] = role

    if not update_fields:
        return jsonify({"message": "No valid fields provided"}), 400

    # upsert=True: this must succeed even for a user whose document hasn't
    # been provisioned yet. $setOnInsert seeds the rest of the schema on
    # first creation so the doc is never left missing fields other routes
    # (lessons, progress, history) depend on. Previously this was a plain
    # update_one with no upsert, so if no doc existed yet, matched_count
    # was 0 and every save permanently 404'd as "User not found".
    defaults = _default_user_doc(user_id)
    set_on_insert = {k: v for k, v in defaults.items() if k not in update_fields}
    users_collection.update_one(
        {"userId": user_id},
        {"$set": update_fields, "$setOnInsert": set_on_insert},
        upsert=True
    )

    return jsonify({"message": "Profile updated successfully", "updated": update_fields}), 200


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

def _phoneme_for_lesson(lessons, lesson_id):
    for lesson in lessons:
        if lesson["id"] == lesson_id:
            return lesson["phoneme"]
    return "r"


def _bumped_phoneme_scores(scores, phoneme, add_score):
    for entry in scores:
        if entry["phoneme"] != phoneme:
            continue
        prev_avg = entry["avgScore"] or 0
        prev_attempts = entry["attempts"] or 0
        entry["avgScore"] = (prev_avg * prev_attempts + add_score) / (prev_attempts + 1)
        entry["attempts"] = prev_attempts + 1
        break
    return scores


def _stamp_word_scores(word_scores, now_iso):
    return [
        {"word": w["word"], "score": w["score"], "timestamp": w.get("timestamp", now_iso)}
        for w in word_scores
        if "word" in w and "score" in w
    ]


@user_bp.route("/api/user/updateUserProgress", methods=["POST"])
def update_user_progress():
    data = request.get_json() or {}
    user_id = data.get("userId")
    lesson_id = data.get("lessonId")
    add_score = data.get("addScore", 0)
    incoming_word_scores = data.get("wordScores", [])

    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"message": "User not found"}), 404

    now_iso = _utc_now_iso()
    phoneme = _phoneme_for_lesson(user["lessons"], lesson_id)
    phoneme_scores = _bumped_phoneme_scores(user["progress"]["phonemeScores"], phoneme, add_score)
    new_word_scores = _stamp_word_scores(incoming_word_scores, now_iso)

    new_history_entry = (user["history"][-1] if user.get("history") else {}).copy()
    new_history_entry.pop("timestamp", None)
    new_history_entry[phoneme] = new_history_entry.get(phoneme, 0) + add_score
    new_history_entry["timestamp"] = now_iso

    users_collection.update_one(
        {"userId": user_id, "lessons.id": lesson_id},
        {"$set": {"lessons.$.score": add_score}}
    )
    users_collection.update_one(
        {"userId": user_id},
        {
            "$set": {"progress.phonemeScores": phoneme_scores},
            "$push": {
                "history": new_history_entry,
                "progress.wordScores": {"$each": new_word_scores}
            }
        }
    )

    return jsonify({"message": "User progress updated successfully"}), 200
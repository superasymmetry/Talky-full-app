from flask import Blueprint, request, jsonify, g
from database import users_collection
from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from groq import Groq
from auth import requires_auth
import os
import random
import secrets
import string

user_bp = Blueprint("user_bp", __name__)

USER_ID_REQUIRED = "user_id is required"

VALID_ROLES = {"Student", "Teacher"}

CONNECT_CODE_ALPHABET = string.ascii_uppercase + string.digits

MAX_SEARCH_RESULTS = 50

try:
    users_collection.create_index("userId", unique=True)
except Exception as e:
    print(f"WARNING: could not create unique index on userId (likely duplicate "
          f"userId docs still exist — run the cleanup script): {e}")


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _generate_unique_connect_code():
    '''6-char classroom-style join code, e.g. "K3F9QZ", used by Teachers so
    Students can link themselves.'''
    for _ in range(20):
        code = ''.join(secrets.choice(CONNECT_CODE_ALPHABET) for _ in range(6))
        if not users_collection.find_one({"connectCode": code}):
            return code
    return ''.join(secrets.choice(CONNECT_CODE_ALPHABET) for _ in range(10))

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
    '''Full default schema for a brand-new user.'''
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
        "connectCode": _generate_unique_connect_code(),
        "teacherId": None,
        "students": [],
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


# Keys that must exist on every user doc, and what to backfill them with if
# they're missing. This is what fixes accounts created before a field
# existed in the schema (e.g. connectCode/teacherId/students added after
# the account was already created) — without this, those old docs just
# permanently lack the field forever, since $setOnInsert only ever runs
# once, at creation time.
def _missing_field_patch(user_id, user_doc):
    patch = {}
    if "connectCode" not in user_doc:
        patch["connectCode"] = _generate_unique_connect_code()
    if "teacherId" not in user_doc:
        patch["teacherId"] = None
    if "students" not in user_doc:
        patch["students"] = []
    if "nickname" not in user_doc:
        patch["nickname"] = ""
    if "age" not in user_doc:
        patch["age"] = None
    if "role" not in user_doc:
        patch["role"] = "Student"
    return patch


def _get_or_create_user(user_id, name=""):
    '''The ONLY place a user doc should ever be created. Also backfills any
    fields that are missing from an existing doc (schema added a field
    after the doc already existed).'''
    existing = users_collection.find_one({"userId": user_id})

    if existing is None:
        defaults = _default_user_doc(user_id, name=name)
        try:
            users_collection.insert_one(defaults)
            return defaults
        except DuplicateKeyError:
            # Lost a race with a concurrent request that inserted first —
            # the unique index guarantees only one doc exists either way.
            existing = users_collection.find_one({"userId": user_id})

    patch = _missing_field_patch(user_id, existing)
    if patch:
        existing = users_collection.find_one_and_update(
            {"userId": user_id},
            {"$set": patch},
            return_document=ReturnDocument.AFTER,
        )
    return existing


@user_bp.route("/api/user/adduser", methods=["POST"])
@requires_auth
def adduser():
    '''Idempotent: safe to call even if the user already exists.'''
    data = request.get_json(silent=True) or {}
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401
    name = data.get("name", "")

    user_doc = _get_or_create_user(user_id, name=name)
    return jsonify(user_doc)

@user_bp.route("/api/user/get_level", methods=["GET", "POST"])
def get_user_level():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    user = users_collection.find_one({"userId": user_id}, {"level": 1})
    if not user or "level" not in user:
        return jsonify({"error": "User not found or level data missing"}), 404
    return jsonify({"level": user["level"]})

@user_bp.route("/api/user/progress", methods=["GET", "POST"])
def get_user_progress_weakness():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"progress.phonemeScores": 1})
    
    if not user or "progress" not in user:
        return jsonify({"error": "User not found or progress data missing"}), 404
    
    return jsonify({"phonemeScores": user["progress"].get("phonemeScores", [])})


@user_bp.route("/api/user/history", methods=["GET", "POST"])
def get_user_history():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"history": 1})
    if not user or "history" not in user:
        return jsonify({"error": "User not found or history data missing"}), 404
    return jsonify({"history": user["history"]})


@user_bp.route("/api/user/lessons", methods=["GET", "POST"])
def get_user_lessons():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    
    user = users_collection.find_one({"userId": user_id}, {"lessons": 1, "_id": 0})
    if not user or "lessons" not in user:
        return jsonify({"error": "User not found or lessons data missing"}), 404
    return jsonify({"lessons": user["lessons"]})


@user_bp.route('/api/user/generatenextlesson', methods=['GET', 'POST'])
def generatenextlesson():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    currentLessonId = data.get("currentLessonId")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400

    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"error": "User not found"}), 404
    maxLessonId = user.get("maxLessonId", 0)
    
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
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    user = _get_or_create_user(user_id)
    user.pop("_id", None)
    return jsonify(user)


@user_bp.route("/api/updateUserProfile", methods=["POST"])
@requires_auth
def update_user_profile():
    '''For saving editable profile fields: upserts nickname/age/role onto the
    user document. Inputs: JSON body with any of nickname/age/role; userId
    comes from the auth token. Returns: JSON of the fields that were updated.
    '''
    data = request.get_json() or {}

    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    # Fetch (and backfill) the current doc first so we know the role we're
    # transitioning *from*, for the link-cleanup below.
    current_doc = _get_or_create_user(user_id)
    previous_role = current_doc.get("role")

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

    users_collection.update_one(
        {"userId": user_id},
        {"$set": update_fields}
    )

    # If the role actually changed, sever stale teacher<->student links so
    # the roster/search views can't end up pointing at someone who no
    # longer holds that role.
    new_role = update_fields.get("role")
    if new_role and new_role != previous_role:
        if previous_role == "Teacher":
            for student_id in current_doc.get("students", []):
                users_collection.update_one(
                    {"userId": student_id, "teacherId": user_id},
                    {"$set": {"teacherId": None}}
                )
            users_collection.update_one(
                {"userId": user_id},
                {"$set": {"students": []}}
            )
        elif previous_role == "Student" and current_doc.get("teacherId"):
            old_teacher_id = current_doc["teacherId"]
            users_collection.update_one(
                {"userId": old_teacher_id},
                {"$pull": {"students": user_id}}
            )
            users_collection.update_one(
                {"userId": user_id},
                {"$set": {"teacherId": None}}
            )

    return jsonify({"message": "Profile updated successfully", "updated": update_fields}), 200


def _require_role(caller_id, expected_role):
    caller = users_collection.find_one({"userId": caller_id})
    if not caller:
        return None, (jsonify({"message": "User not found"}), 404)
    if caller.get("role") != expected_role:
        return None, (jsonify({"message": f"Only a {expected_role} can do this"}), 403)
    return caller, None


@user_bp.route("/api/user/linkByCode", methods=["POST"])
@requires_auth
def link_by_code():
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"message": "code is required"}), 400

    caller_id = g.current_user.get("sub")
    if not caller_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    caller, err = _require_role(caller_id, "Student")
    if err:
        return err

    teacher = users_collection.find_one({"connectCode": code})
    if not teacher:
        return jsonify({"message": "No account found with that code"}), 404
    if teacher.get("role") != "Teacher":
        return jsonify({"message": "That code doesn't belong to a teacher"}), 400
    if teacher["userId"] == caller_id:
        return jsonify({"message": "You can't link to yourself"}), 400

    teacher_id = teacher["userId"]
    users_collection.update_one(
        {"userId": teacher_id},
        {"$addToSet": {"students": caller_id}}
    )
    users_collection.update_one(
        {"userId": caller_id},
        {"$set": {"teacherId": teacher_id}}
    )

    return jsonify({"message": "Linked successfully", "teacherId": teacher_id}), 200


@user_bp.route("/api/user/searchStudents", methods=["GET"])
@requires_auth
def search_students():
    caller_id = g.current_user.get("sub")
    if not caller_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    caller, err = _require_role(caller_id, "Teacher")
    if err:
        return err

    query = (request.args.get("q") or "").strip()
    mongo_filter = {"role": "Student"}
    if query:
        mongo_filter["$or"] = [
            {"name": {"$regex": query, "$options": "i"}},
            {"nickname": {"$regex": query, "$options": "i"}},
        ]

    cursor = users_collection.find(
        mongo_filter,
        {"userId": 1, "name": 1, "nickname": 1, "age": 1, "teacherId": 1, "_id": 0}
    ).limit(MAX_SEARCH_RESULTS)

    my_students = set(caller.get("students", []))
    results = []
    for s in cursor:
        results.append({
            "userId": s["userId"],
            "name": s.get("name", ""),
            "nickname": s.get("nickname", ""),
            "age": s.get("age"),
            "inMyRoster": s["userId"] in my_students,
            "hasOtherTeacher": bool(s.get("teacherId")) and s.get("teacherId") != caller_id,
        })

    return jsonify({"students": results}), 200


@user_bp.route("/api/user/addStudent", methods=["POST"])
@requires_auth
def add_student():
    data = request.get_json() or {}
    student_id = data.get("studentId")
    if not student_id:
        return jsonify({"message": "studentId is required"}), 400

    caller_id = g.current_user.get("sub")
    if not caller_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    caller, err = _require_role(caller_id, "Teacher")
    if err:
        return err

    student = users_collection.find_one({"userId": student_id})
    if not student:
        return jsonify({"message": "Student not found"}), 404
    if student.get("role") != "Student":
        return jsonify({"message": "That user is not a student"}), 400
    if student.get("teacherId") and student["teacherId"] != caller_id:
        return jsonify({"message": "That student already has a different teacher"}), 400

    users_collection.update_one(
        {"userId": caller_id},
        {"$addToSet": {"students": student_id}}
    )
    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"teacherId": caller_id}}
    )

    return jsonify({"message": "Student added"}), 200


@user_bp.route("/api/user/unlink", methods=["POST"])
@requires_auth
def unlink():
    data = request.get_json(silent=True) or {}
    caller_id = g.current_user.get("sub")
    if not caller_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    caller = users_collection.find_one({"userId": caller_id})
    if not caller:
        return jsonify({"message": "User not found"}), 404

    if caller.get("role") == "Teacher":
        student_id = data.get("studentId")
        if not student_id:
            return jsonify({"message": "studentId is required"}), 400
        users_collection.update_one(
            {"userId": caller_id},
            {"$pull": {"students": student_id}}
        )
        users_collection.update_one(
            {"userId": student_id, "teacherId": caller_id},
            {"$set": {"teacherId": None}}
        )
        return jsonify({"message": "Student removed"}), 200
    else:
        teacher_id = caller.get("teacherId")
        if not teacher_id:
            return jsonify({"message": "No teacher linked"}), 400
        users_collection.update_one(
            {"userId": caller_id},
            {"$set": {"teacherId": None}}
        )
        users_collection.update_one(
            {"userId": teacher_id},
            {"$pull": {"students": caller_id}}
        )
        return jsonify({"message": "Teacher removed"}), 200


def _progress_summary(user_doc):
    scores = [p["avgScore"] for p in user_doc.get("progress", {}).get("phonemeScores", [])
              if p.get("avgScore") is not None]
    overall = round(sum(scores) / len(scores), 2) if scores else None
    lessons_done = sum(1 for l in user_doc.get("lessons", []) if l.get("score", 0) > 0)
    return {"overallScore": overall, "lessonsDone": lessons_done}


@user_bp.route("/api/user/roster", methods=["GET"])
@requires_auth
def get_roster():
    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Teacher")
    if err:
        return err

    student_ids = caller.get("students", [])
    students = list(users_collection.find({"userId": {"$in": student_ids}}))
    roster = [{
        "userId": s["userId"],
        "name": s.get("name", ""),
        "nickname": s.get("nickname", ""),
        "age": s.get("age"),
        **_progress_summary(s)
    } for s in students]
    return jsonify({"students": roster}), 200


@user_bp.route("/api/user/myTeacher", methods=["GET"])
@requires_auth
def get_my_teacher():
    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Student")
    if err:
        return err

    teacher_id = caller.get("teacherId")
    if not teacher_id:
        return jsonify({"teacher": None}), 200

    teacher = users_collection.find_one(
        {"userId": teacher_id},
        {"_id": 0, "userId": 1, "name": 1, "nickname": 1}
    )
    return jsonify({"teacher": teacher}), 200


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
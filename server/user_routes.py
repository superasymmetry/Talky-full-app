from flask import Blueprint, request, jsonify, g
from database import users_collection
from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from groq import Groq
from auth import requires_auth
from access import _require_role, _authorize_student_access, _require_teacher_of
import os
import secrets
import string

user_bp = Blueprint("user_bp", __name__)

USER_ID_REQUIRED = "user_id is required"
NOT_AUTHORIZED_FOR_USER = "Not authorized for this user"

VALID_ROLES = {"Student", "Teacher", "Parent"}

CONNECT_CODE_ALPHABET = string.ascii_uppercase + string.digits

# avoid flagging the stdlib random module
_rng = secrets.SystemRandom()

MAX_SEARCH_RESULTS = 50

try:
    users_collection.create_index("userId", unique=True)
except Exception as e:
    print(f"WARNING: could not create unique index on userId (likely duplicate "
          f"userId docs still exist — run the cleanup script): {e}")


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _build_default_game_state():
    owned_tiles = []
    start = -1.5
    for x in range(4):
        for z in range(4):
            owned_tiles.append(f"{start + x},{start + z}")

    return {
        "ownedTiles": owned_tiles,
        "energy": 80,
        "lastEnergyUpdatedAt": _utc_now_iso(),
        "capturedTiles": 16,
    }


def _reconcile_game_state(state, now=None):
    if not state:
        state = _build_default_game_state()

    if now is None:
        now = datetime.now(timezone.utc)

    last_updated_at = state.get("lastEnergyUpdatedAt")
    if last_updated_at:
        try:
            last_updated_dt = datetime.fromisoformat(last_updated_at.replace("Z", "+00:00"))
        except ValueError:
            last_updated_dt = now
    else:
        last_updated_dt = now

    elapsed_minutes = max(0, int((now - last_updated_dt).total_seconds() // 60))
    current_energy = min(80, int(state.get("energy", 80)) + elapsed_minutes)

    return {
        **state,
        "energy": current_energy,
        "lastEnergyUpdatedAt": now.isoformat(),
    }


# Default categories for new users
DEFAULT_PHONEMES = ["l", "r", "s", "th", "ch", "sh"]  # add more as needed
DEFAULT_POSITIONS = ["initial", "medial", "final"]
DEFAULT_SOUND_TYPES = ["plosive", "fricative", "nasal", "liquid", "glide", "vowel"]
DEFAULT_SYLLABLES = [1, 2, 3]  # word length
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


# Phonemes probed by the new-user intake assessment, chosen for a spread
# across the articulation categories SLPs commonly screen for in children
# (fricative, liquid x2, postalveolar fricative, affricate, plosive) while
# staying short enough to finish in one sitting.
ASSESSMENT_PHONEMES = ["s", "r", "l", "ʃ", "tʃ", "k"]


def _build_assessment_queue():
    '''One (phoneme, words) pair per ASSESSMENT_PHONEMES entry, in order.
    Consumed one at a time by generatenextlesson via pendingAssessmentQueue
    (see _pick_next_lesson_phoneme_and_words) - each assessment lesson only
    unlocks after the previous one is finished, exactly like any other
    lesson, rather than all 6 being handed out and unlockable at once.
    '''
    return [
        (phoneme, _rng.sample(phoneme_word_bank.get(phoneme, ["practice", "word"]), k=2))
        for phoneme in ASSESSMENT_PHONEMES
    ]


def _assessment_lesson(lesson_id, phoneme, words):
    return {
        "id": str(lesson_id),
        "phoneme": phoneme,
        "words": words,
        "score": 0,
        "is_assessment": True,
    }


def _default_user_doc(user_id, name=""):
    '''Full default schema for a brand-new user.'''
    phonemes = ["l", "r", "p", "b", "t", "d", "k", "g", "f", "v", "s", "z",
                "ʃ", "sh", "ʒ", "tʃ", "ch", "dʒ", "j", "m", "n", "ŋ", "w", "y",
                "a", "e", "i", "o", "u"]
    phoneme_scores = [{"phoneme": ph, "avgScore": None, "attempts": None} for ph in phonemes]
    initial_history = dict.fromkeys(phonemes, 0)
    initial_history["timestamp"] = _utc_now_iso()

    # only build the first assessment lesson, the rest come from generatenextlesson
    queue = _build_assessment_queue()
    first_phoneme, first_words = queue[0]
    remaining_queue = [{"phoneme": p, "words": w} for p, w in queue[1:]]

    return {
        "userId": user_id,
        "name": name,
        "nickname": "",
        "age": None,
        "role": "Student",
        "connectCode": _generate_unique_connect_code(),
        "teacherId": None,
        "students": [],

        # parent-side fields
        "children": [],
        "parentIds": [],
        "pendingParentRequests": [],
        "progress": {
            "phonemeScores": phoneme_scores,
            "wordScores": []
        },
        "history": [initial_history],
        "lessons": [_assessment_lesson(1, first_phoneme, first_words)],
        "level": {"current": 1, "subpoints": 20, "maxval": 100},
        "maxLessonId": 1,
        "pendingAssessmentQueue": remaining_queue,
        "assessmentResults": None,
        "gameState": _build_default_game_state(),
        "activeGoal": None,
        "pendingAssignedLesson": None,
        "pendingTeacherRequest": None,
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
    if "activeGoal" not in user_doc:
        patch["activeGoal"] = None
    if "pendingAssignedLesson" not in user_doc:
        patch["pendingAssignedLesson"] = None
    if "pendingTeacherRequest" not in user_doc:
        patch["pendingTeacherRequest"] = None
    if "children" not in user_doc:
        patch["children"] = []
    if "parentIds" not in user_doc:
        patch["parentIds"] = []
    if "pendingParentRequests" not in user_doc:
        patch["pendingParentRequests"] = []
    if "pendingAssessmentQueue" not in user_doc:
        patch["pendingAssessmentQueue"] = []
    if "assessmentResults" not in user_doc:
        patch["assessmentResults"] = None
    return patch


def _get_or_create_user(user_id, name=""):
    existing = users_collection.find_one({"userId": user_id})

    if existing is None:
        defaults = _default_user_doc(user_id, name=name)
        try:
            users_collection.insert_one(defaults)
            defaults.pop("_id", None)
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
    existing.pop("_id", None)
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
@requires_auth
def get_user_level():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err
    user = users_collection.find_one({"userId": user_id}, {"level": 1})
    if not user or "level" not in user:
        return jsonify({"error": "User not found or level data missing"}), 404
    return jsonify({"level": user["level"]})

@user_bp.route("/api/user/progress", methods=["GET", "POST"])
@requires_auth
def get_user_progress_weakness():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err

    user = users_collection.find_one({"userId": user_id}, {"progress.phonemeScores": 1})

    if not user or "progress" not in user:
        return jsonify({"error": "User not found or progress data missing"}), 404

    return jsonify({"phonemeScores": user["progress"].get("phonemeScores", [])})


@user_bp.route("/api/user/history", methods=["GET", "POST"])
@requires_auth
def get_user_history():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err

    user = users_collection.find_one({"userId": user_id}, {"history": 1})
    if not user or "history" not in user:
        return jsonify({"error": "User not found or history data missing"}), 404
    return jsonify({"history": user["history"]})


@user_bp.route("/api/user/lessons", methods=["GET", "POST"])
@requires_auth
def get_user_lessons():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err

    user = users_collection.find_one(
        {"userId": user_id}, {"lessons": 1, "pendingAssessmentQueue": 1, "_id": 0}
    )
    if not user or "lessons" not in user:
        return jsonify({"error": "User not found or lessons data missing"}), 404
    return jsonify({
        "lessons": user["lessons"],
        # How many assessment lessons haven't been generated yet - lets the
        # dashboard render locked placeholder cards for them instead of the
        # list just growing one at a time with nothing to show for what's
        # still ahead.
        "assessmentRemaining": len(user.get("pendingAssessmentQueue") or []),
    })


@user_bp.route('/api/user/game-state', methods=['GET', 'POST'])
@requires_auth
def game_state():
    user_id = request.args.get("user_id") or (request.get_json(silent=True) or {}).get("userId")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    if g.current_user.get("sub") != user_id:
        return jsonify({"message": NOT_AUTHORIZED_FOR_USER}), 403

    now = datetime.now(timezone.utc)
    user = users_collection.find_one({"userId": user_id}, {"gameState": 1, "_id": 0})
    if request.method == "GET":
        if not user or not user.get("gameState"):
            default_state = _reconcile_game_state(_build_default_game_state(), now=now)
            users_collection.update_one(
                {"userId": user_id},
                {"$set": {"gameState": default_state}},
                upsert=True,
            )
            return jsonify({"gameState": default_state})

        reconciled_state = _reconcile_game_state(user["gameState"], now=now)
        users_collection.update_one(
            {"userId": user_id},
            {"$set": {"gameState": reconciled_state}},
            upsert=True,
        )
        return jsonify({"gameState": reconciled_state})

    payload = request.get_json(silent=True) or {}
    incoming_state = payload.get("gameState") or {}
    if not incoming_state:
        return jsonify({"error": "gameState is required"}), 400

    existing_state = (user or {}).get("gameState") if user else None
    base_state = _reconcile_game_state(existing_state or _build_default_game_state(), now=now)

    next_state = {
        **base_state,
        **incoming_state,
        "energy": incoming_state.get("energy", base_state.get("energy", 80)),
        "lastEnergyUpdatedAt": incoming_state.get("lastEnergyUpdatedAt") or now.isoformat(),
        "capturedTiles": incoming_state.get("capturedTiles", len(incoming_state.get("ownedTiles", []))),
    }

    users_collection.update_one(
        {"userId": user_id},
        {"$set": {"gameState": next_state}},
        upsert=True,
    )
    return jsonify({"gameState": next_state})


def _weakest_phoneme(phoneme_scores):
    '''The never-yet-scored phoneme if there is one, else the lowest-avgScore one.'''
    lowest = float('inf')
    phoneme = 'r'
    for phoneme_object in phoneme_scores:
        if not phoneme_object['avgScore']:
            return phoneme_object['phoneme']
        if phoneme_object['avgScore'] < lowest:
            lowest = phoneme_object['avgScore']
            phoneme = phoneme_object['phoneme']
    return phoneme


def _pick_next_lesson_phoneme_and_words(user):
    '''Returns (phoneme, words, consumed_assignment, is_assessment) for the
    next auto-generated lesson. Draining pendingAssessmentQueue takes
    priority over everything else, so both the original intake assessment
    and a retake (see retake_assessment) unlock one assessment lesson at a
    time - exactly like every other lesson only unlocking after the
    previous one - instead of handing out the whole batch at once.'''
    queue = user.get("pendingAssessmentQueue") or []
    if queue:
        item = queue[0]
        return item["phoneme"], item["words"], False, True

    pending = user.get("pendingAssignedLesson")
    if pending:
        # Teacher hand-picked the exact phoneme + words for this one lesson.
        return pending["phoneme"], pending["words"], True, False

    active_goal = user.get("activeGoal")
    # Standing teacher-set focus phoneme overrides auto weakest-phoneme
    # selection until the teacher clears/changes it.
    phoneme = active_goal["phoneme"] if active_goal else _weakest_phoneme(user['progress']['phonemeScores'])
    words = _rng.sample(phoneme_word_bank.get(phoneme, ["practice", "word"]), k=2)
    return phoneme, words, False, False


def _assessment_results_snapshot(phoneme_scores):
    scores_by_phoneme = {p["phoneme"]: p for p in phoneme_scores}
    return {
        "phonemeScores": [
            {
                "phoneme": ph,
                "avgScore": scores_by_phoneme.get(ph, {}).get("avgScore"),
                "attempts": scores_by_phoneme.get(ph, {}).get("attempts"),
            }
            for ph in ASSESSMENT_PHONEMES
        ],
        "completedAt": _utc_now_iso(),
    }


@user_bp.route('/api/user/generatenextlesson', methods=['GET', 'POST'])
@requires_auth
def generatenextlesson():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    currentLessonId = data.get("currentLessonId")
    if not user_id:
        return jsonify({"error": USER_ID_REQUIRED}), 400
    if g.current_user.get("sub") != user_id:
        return jsonify({"message": NOT_AUTHORIZED_FOR_USER}), 403

    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"error": "User not found"}), 404
    maxLessonId = user.get("maxLessonId", 0)

    # Every lesson - assessment or real - is only ever generated one at a
    # time, right after the previous one (the current max) finishes. This
    # used to be `currentLessonId == maxLessonId - 1` to preserve a 1-lesson
    # lookahead buffer, but that buffer only ever existed because the
    # original signup bulk-created 4 real lessons at once; now that real
    # lessons are generated on demand same as assessment ones, that gate had
    # nothing left to buffer against and would 400 forever starting from
    # the very first real lesson, permanently blocking progress.
    eligible = (currentLessonId == maxLessonId)
    if not eligible:
        return jsonify({"message": "Not eligible for new lesson yet"}), 400

    next_lesson_id = str(maxLessonId + 1)
    phoneme, words, consumed_assignment, is_assessment = _pick_next_lesson_phoneme_and_words(user)

    new_lesson = {
        "id": next_lesson_id,
        "phoneme": phoneme,
        "words": words,
        "score": 0,
    }
    if is_assessment:
        new_lesson["is_assessment"] = True

    update = {
        "$push": {"lessons": new_lesson},
        "$set": {"maxLessonId": maxLessonId + 1},
    }
    if is_assessment:
        update["$set"]["pendingAssessmentQueue"] = (user.get("pendingAssessmentQueue") or [])[1:]
    if consumed_assignment:
        update["$unset"] = {"pendingAssignedLesson": ""}

    # The lesson the user just finished (currentLessonId) - if it was an
    # assessment lesson and we're now handing out a non-assessment one, the
    # assessment (original or a retake) just completed, so snapshot the
    # scores for the results view (Profile.jsx) before they keep changing.
    current_lesson = next(
        (l for l in user.get('lessons', []) if str(l.get('id')) == str(currentLessonId)), None
    )
    if not is_assessment and current_lesson and current_lesson.get('is_assessment'):
        update["$set"]["assessmentResults"] = _assessment_results_snapshot(
            user.get("progress", {}).get("phonemeScores", [])
        )

    users_collection.update_one({"userId": user_id}, update)
    return jsonify({f"lessons.{next_lesson_id}": new_lesson}), 200


@user_bp.route('/api/user/retakeAssessment', methods=['POST'])
@requires_auth
def retake_assessment():
    '''Lets a student redo the intake assessment if the results don't seem
    accurate: resets the assessed phonemes' averages, queues a fresh
    assessment pass (drained one lesson at a time by generatenextlesson,
    same as the original), and immediately creates the first lesson of that
    pass so there's something to play right away.'''
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"message": "User not found"}), 404
    if user.get("role") != "Student":
        return jsonify({"message": "Only a Student can retake the assessment"}), 403

    maxLessonId = user.get("maxLessonId", 0)
    next_lesson_id = maxLessonId + 1

    queue = _build_assessment_queue()
    first_phoneme, first_words = queue[0]
    remaining_queue = [{"phoneme": p, "words": w} for p, w in queue[1:]]
    new_lesson = _assessment_lesson(next_lesson_id, first_phoneme, first_words)

    reset_scores = [
        {**entry, "avgScore": None, "attempts": None}
        if entry.get("phoneme") in ASSESSMENT_PHONEMES else entry
        for entry in user.get("progress", {}).get("phonemeScores", [])
    ]

    users_collection.update_one(
        {"userId": user_id},
        {
            "$push": {"lessons": new_lesson},
            "$set": {
                "maxLessonId": next_lesson_id,
                "pendingAssessmentQueue": remaining_queue,
                "progress.phonemeScores": reset_scores,
                "assessmentResults": None,
            },
        }
    )
    return jsonify({"lesson": new_lesson}), 200

@user_bp.route("/api/getUserProfile", methods=["GET"])
@requires_auth
def get_user_profile():
    user_id = g.current_user.get("sub")
    if not user_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    user = _get_or_create_user(user_id)
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
        elif previous_role == "Student":
            if current_doc.get("teacherId"):
                old_teacher_id = current_doc["teacherId"]
                users_collection.update_one(
                    {"userId": old_teacher_id},
                    {"$pull": {"students": user_id}}
                )
            for parent_id in current_doc.get("parentIds", []):
                users_collection.update_one(
                    {"userId": parent_id},
                    {"$pull": {"children": user_id}}
                )
            users_collection.update_one(
                {"userId": user_id},
                {"$set": {"teacherId": None, "parentIds": [], "pendingTeacherRequest": None,
                          "pendingParentRequests": []}}
            )
        if previous_role == "Parent":
            for child_id in current_doc.get("children", []):
                users_collection.update_one(
                    {"userId": child_id, "parentIds": user_id},
                    {"$pull": {"parentIds": user_id}}
                )
            users_collection.update_one(
                {"userId": user_id},
                {"$set": {"children": []}}
            )

    return jsonify({"message": "Profile updated successfully", "updated": update_fields}), 200


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


MIN_STUDENT_SEARCH_QUERY_LEN = 2


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
    # A blank/near-blank query used to return the first 50 students in the
    # whole database, name+age included, to anyone who'd merely set their
    # own role to "Teacher" (self-service, unverified) - the profile page
    # even triggered it automatically on load. Requiring an actual search
    # term means a self-declared teacher can only look up a *specific* known
    # child by name, not browse the roster of every child on the platform.
    if len(query) < MIN_STUDENT_SEARCH_QUERY_LEN:
        return jsonify({"students": []}), 200

    mongo_filter = {
        "role": "Student",
        "$or": [
            {"name": {"$regex": query, "$options": "i"}},
            {"nickname": {"$regex": query, "$options": "i"}},
        ],
    }

    cursor = users_collection.find(
        mongo_filter,
        {"userId": 1, "name": 1, "nickname": 1, "age": 1, "teacherId": 1, "pendingTeacherRequest": 1, "_id": 0}
    ).limit(MAX_SEARCH_RESULTS)

    my_students = set(caller.get("students", []))
    results = []
    for s in cursor:
        pending = s.get("pendingTeacherRequest") or {}
        results.append({
            "userId": s["userId"],
            "name": s.get("name", ""),
            "nickname": s.get("nickname", ""),
            "age": s.get("age"),
            "inMyRoster": s["userId"] in my_students,
            "hasOtherTeacher": bool(s.get("teacherId")) and s.get("teacherId") != caller_id,
            "hasPendingRequestFromMe": pending.get("teacherId") == caller_id,
        })

    return jsonify({"students": results}), 200


@user_bp.route("/api/user/addStudent", methods=["POST"])
@requires_auth
def add_student():
    '''Sends a link request rather than linking immediately: a self-declared
    "Teacher" (role is unverified - anyone can set it on their own profile)
    must not be able to attach themselves to a child's account just by
    finding that child via search. The student has to see and approve the
    request (see respond_to_teacher_request) before any link is created.
    '''
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
    if student.get("teacherId") == caller_id:
        return jsonify({"message": "That student is already in your roster"}), 200
    if student.get("teacherId"):
        return jsonify({"message": "That student already has a different teacher"}), 400
    existing_request = student.get("pendingTeacherRequest")
    if existing_request and existing_request.get("teacherId") == caller_id:
        return jsonify({"message": "Request already sent — waiting on the student to respond"}), 200

    pending_request = {
        "teacherId": caller_id,
        "teacherName": caller.get("name") or caller.get("nickname") or "A teacher",
        "requestedAt": _utc_now_iso(),
    }
    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"pendingTeacherRequest": pending_request}}
    )

    return jsonify({"message": "Request sent — waiting on the student to accept"}), 200


@user_bp.route("/api/user/respondToTeacherRequest", methods=["POST"])
@requires_auth
def respond_to_teacher_request():
    '''Student-only: accept or decline a pending teacher link request. This
    is the only way addStudent's request actually becomes a link.'''
    data = request.get_json(silent=True) or {}
    accept = bool(data.get("accept"))

    caller_id = g.current_user.get("sub")
    if not caller_id:
        return jsonify({"message": "Token missing sub claim"}), 401

    caller, err = _require_role(caller_id, "Student")
    if err:
        return err

    pending = caller.get("pendingTeacherRequest")
    if not pending:
        return jsonify({"message": "No pending request"}), 400

    teacher_id = pending["teacherId"]
    users_collection.update_one(
        {"userId": caller_id},
        {"$unset": {"pendingTeacherRequest": ""}}
    )

    if not accept:
        return jsonify({"message": "Request declined"}), 200

    # Re-check the teacher still exists/holds the role and the student
    # hasn't been claimed by someone else in the meantime.
    teacher = users_collection.find_one({"userId": teacher_id, "role": "Teacher"})
    if not teacher:
        return jsonify({"message": "That teacher account no longer exists"}), 404
    if caller.get("teacherId") and caller["teacherId"] != teacher_id:
        return jsonify({"message": "You're already linked to a different teacher"}), 400

    users_collection.update_one(
        {"userId": teacher_id},
        {"$addToSet": {"students": caller_id}}
    )
    users_collection.update_one(
        {"userId": caller_id},
        {"$set": {"teacherId": teacher_id}}
    )

    return jsonify({"message": "Linked successfully", "teacherId": teacher_id}), 200


MIN_CHILD_SEARCH_QUERY_LEN = 2


@user_bp.route("/api/user/searchChildren", methods=["GET"])
@requires_auth
def search_children():
    # parent-equivalent of searchStudents
    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Parent")
    if err:
        return err

    query = (request.args.get("q") or "").strip()
    if len(query) < MIN_CHILD_SEARCH_QUERY_LEN:
        return jsonify({"students": []}), 200

    mongo_filter = {
        "role": "Student",
        "$or": [
            {"name": {"$regex": query, "$options": "i"}},
            {"nickname": {"$regex": query, "$options": "i"}},
        ],
    }
    cursor = users_collection.find(
        mongo_filter,
        {"userId": 1, "name": 1, "nickname": 1, "age": 1, "parentIds": 1,
         "pendingParentRequests": 1, "_id": 0}
    ).limit(MAX_SEARCH_RESULTS)

    my_children = set(caller.get("children", []))
    results = []
    for s in cursor:
        pending_ids = {p.get("parentId") for p in (s.get("pendingParentRequests") or [])}
        results.append({
            "userId": s["userId"],
            "name": s.get("name", ""),
            "nickname": s.get("nickname", ""),
            "age": s.get("age"),
            "inMyChildren": s["userId"] in my_children,
            "hasPendingRequestFromMe": caller_id in pending_ids,
        })

    return jsonify({"students": results}), 200


@user_bp.route("/api/user/requestChildLink", methods=["POST"])
@requires_auth
def request_child_link():
    # send link request from parent to child
    data = request.get_json(silent=True) or {}
    student_id = data.get("studentId")
    if not student_id:
        return jsonify({"message": "studentId is required"}), 400

    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Parent")
    if err:
        return err

    student = users_collection.find_one({"userId": student_id})
    if not student:
        return jsonify({"message": "Student not found"}), 404
    if student.get("role") != "Student":
        return jsonify({"message": "That user is not a student"}), 400
    if caller_id in (student.get("parentIds") or []):
        return jsonify({"message": "You're already linked to this student"}), 200

    pending_list = student.get("pendingParentRequests") or []
    if any(p.get("parentId") == caller_id for p in pending_list):
        return jsonify({"message": "Request already sent — waiting on the student to respond"}), 200

    pending_request = {
        "parentId": caller_id,
        "parentName": caller.get("name") or caller.get("nickname") or "A parent",
        "requestedAt": _utc_now_iso(),
    }
    users_collection.update_one(
        {"userId": student_id},
        {"$push": {"pendingParentRequests": pending_request}}
    )

    return jsonify({"message": "Request sent — waiting on the student to accept"}), 200


@user_bp.route("/api/user/respondToParentRequest", methods=["POST"])
@requires_auth
def respond_to_parent_request():
    '''Student-only: accept or decline one specific pending parent request
    (a student can have more than one pending at once, so the caller must
    say which parentId they're responding to).'''
    data = request.get_json(silent=True) or {}
    parent_id = data.get("parentId")
    accept = bool(data.get("accept"))
    if not parent_id:
        return jsonify({"message": "parentId is required"}), 400

    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Student")
    if err:
        return err

    pending_list = caller.get("pendingParentRequests") or []
    if not any(p.get("parentId") == parent_id for p in pending_list):
        return jsonify({"message": "No pending request from that parent"}), 400

    users_collection.update_one(
        {"userId": caller_id},
        {"$pull": {"pendingParentRequests": {"parentId": parent_id}}}
    )

    if not accept:
        return jsonify({"message": "Request declined"}), 200

    parent = users_collection.find_one({"userId": parent_id, "role": "Parent"})
    if not parent:
        return jsonify({"message": "That parent account no longer exists"}), 404

    users_collection.update_one(
        {"userId": parent_id},
        {"$addToSet": {"children": caller_id}}
    )
    users_collection.update_one(
        {"userId": caller_id},
        {"$addToSet": {"parentIds": parent_id}}
    )

    return jsonify({"message": "Linked successfully", "parentId": parent_id}), 200


@user_bp.route("/api/user/removeChild", methods=["POST"])
@requires_auth
def remove_child():
    # for parent to unlink themselves from child
    data = request.get_json(silent=True) or {}
    student_id = data.get("studentId")
    if not student_id:
        return jsonify({"message": "studentId is required"}), 400

    caller_id = g.current_user.get("sub")
    err = _require_role(caller_id, "Parent")[1]
    if err:
        return err

    users_collection.update_one(
        {"userId": caller_id},
        {"$pull": {"children": student_id}}
    )
    users_collection.update_one(
        {"userId": student_id},
        {"$pull": {"parentIds": caller_id}}
    )

    return jsonify({"message": "Removed"}), 200


@user_bp.route("/api/user/myChildren", methods=["GET"])
@requires_auth
def get_my_children():
    caller_id = g.current_user.get("sub")
    caller, err = _require_role(caller_id, "Parent")
    if err:
        return err

    child_ids = caller.get("children", [])
    children = list(users_collection.find({"userId": {"$in": child_ids}}))
    result = [{
        "userId": c["userId"],
        "name": c.get("name", ""),
        "nickname": c.get("nickname", ""),
        "age": c.get("age"),
        **_progress_summary(c)
    } for c in children]
    return jsonify({"children": result}), 200


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


@user_bp.route("/api/user/student/<student_id>/detail", methods=["GET"])
@requires_auth
def get_student_detail(student_id):
    student, err = _authorize_student_access(g.current_user.get("sub"), student_id)
    if err:
        return err

    return jsonify({
        "userId": student["userId"],
        "name": student.get("name", ""),
        "nickname": student.get("nickname", ""),
        "age": student.get("age"),
        "progress": student.get("progress", {}),
        "history": student.get("history", []),
        "level": student.get("level"),
        "activeGoal": student.get("activeGoal"),
        "pendingAssignedLesson": student.get("pendingAssignedLesson"),
    }), 200


@user_bp.route("/api/user/student/<student_id>/goal", methods=["GET"])
@requires_auth
def get_student_goal(student_id):
    student, err = _authorize_student_access(g.current_user.get("sub"), student_id)
    if err:
        return err
    return jsonify({"activeGoal": student.get("activeGoal")}), 200


@user_bp.route("/api/user/student/<student_id>/goal", methods=["POST"])
@requires_auth
def set_student_goal(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    phoneme = data.get("phoneme")
    if not phoneme or phoneme not in phoneme_word_bank:
        return jsonify({"message": f"phoneme must be one of {sorted(phoneme_word_bank.keys())}"}), 400
    note = data.get("note") or ""
    if not isinstance(note, str):
        return jsonify({"message": "note must be a string"}), 400

    goal = {
        "phoneme": phoneme,
        "note": note.strip(),
        "setAt": _utc_now_iso(),
        "setBy": caller_id,
    }
    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"activeGoal": goal}}
    )
    return jsonify({"activeGoal": goal}), 200


@user_bp.route("/api/user/student/<student_id>/goal", methods=["DELETE"])
@requires_auth
def clear_student_goal(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"activeGoal": None}}
    )
    return jsonify({"message": "Goal cleared"}), 200


@user_bp.route("/api/user/student/<student_id>/assign-lesson", methods=["POST"])
@requires_auth
def assign_student_lesson(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    phoneme = data.get("phoneme")
    if not phoneme or phoneme not in phoneme_word_bank:
        return jsonify({"message": f"phoneme must be one of {sorted(phoneme_word_bank.keys())}"}), 400
    words = data.get("words")
    if not isinstance(words, list) or not (1 <= len(words) <= 4) or not all(isinstance(w, str) and w.strip() for w in words):
        return jsonify({"message": "words must be a list of 1-4 non-empty strings"}), 400
    note = data.get("note") or ""
    if not isinstance(note, str):
        return jsonify({"message": "note must be a string"}), 400

    assignment = {
        "phoneme": phoneme,
        "words": [w.strip() for w in words],
        "note": note.strip(),
        "assignedAt": _utc_now_iso(),
        "assignedBy": caller_id,
    }
    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"pendingAssignedLesson": assignment}}
    )
    return jsonify({"pendingAssignedLesson": assignment}), 200


@user_bp.route("/api/user/student/<student_id>/assign-lesson", methods=["DELETE"])
@requires_auth
def cancel_student_assignment(student_id):
    caller_id = g.current_user.get("sub")
    _caller, _student, err = _require_teacher_of(caller_id, student_id)
    if err:
        return err

    users_collection.update_one(
        {"userId": student_id},
        {"$set": {"pendingAssignedLesson": None}}
    )
    return jsonify({"message": "Assignment cancelled"}), 200


@user_bp.route("/api/getUserProgress", methods=["GET"])
@requires_auth
def get_user_progress():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId parameter"}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err

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
@requires_auth
def update_user_progress():
    data = request.get_json() or {}
    user_id = data.get("userId")
    if g.current_user.get("sub") != user_id:
        return jsonify({"message": NOT_AUTHORIZED_FOR_USER}), 403
    # lessons[].id is stored as a string ("1", "2", ...), but the frontend
    # sends lessonId parsed as an int — normalize here so both the dict
    # lookup below and the "lessons.id" Mongo query match instead of
    # silently finding nothing.
    lesson_id = str(data.get("lessonId"))
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

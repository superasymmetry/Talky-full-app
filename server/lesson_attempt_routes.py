from flask import Blueprint, request, jsonify, g
from database import lesson_attempts_collection
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
from auth import requires_auth
from access import _authorize_student_access

lesson_attempt_bp = Blueprint("lesson_attempt_bp", __name__)

VALID_STATUSES = {"completed", "failed"}

MAX_ATTEMPT_NUMBER_RETRIES = 3

DEFAULT_ATTEMPTS_LIMIT = 20
MAX_ATTEMPTS_LIMIT = 100


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


@lesson_attempt_bp.route("/api/user/lessonAttempts", methods=["POST"])
@requires_auth
def save_lesson_attempt():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    lesson_id = data.get("lessonId")
    status = data.get("status")

    if not user_id or lesson_id is None:
        return jsonify({"message": "userId and lessonId are required"}), 400
    if g.current_user.get("sub") != user_id:
        return jsonify({"message": "Not authorized for this user"}), 403
    if status not in VALID_STATUSES:
        return jsonify({"message": f"status must be one of {sorted(VALID_STATUSES)}"}), 400

    lesson_id = str(lesson_id)

    doc = {
        "userId": user_id,
        "lessonId": lesson_id,
        "phoneme": data.get("phoneme"),
        "status": status,
        "overallScore": data.get("overallScore", 0),
        "livesRemaining": data.get("livesRemaining", 0),
        "maxLives": data.get("maxLives", 3),
        "wordHistory": data.get("wordHistory", []),
        "phonemeStats": data.get("phonemeStats", []),
        "sentenceResults": data.get("sentenceResults", []),
        "prosody": data.get("prosody", []),
        "feedbackHistory": data.get("feedbackHistory", []),
        "createdAt": _utc_now_iso(),
    }

    for _ in range(MAX_ATTEMPT_NUMBER_RETRIES):
        doc["attemptNumber"] = lesson_attempts_collection.count_documents(
            {"userId": user_id, "lessonId": lesson_id}
        ) + 1
        try:
            lesson_attempts_collection.insert_one(doc)
            break
        except DuplicateKeyError:
            continue
    else:
        return jsonify({"message": "Could not allocate attempt number, try again"}), 409

    doc.pop("_id", None)
    return jsonify(doc), 201


@lesson_attempt_bp.route("/api/user/lessonAttempts", methods=["GET"])
@requires_auth
def get_lesson_attempts():
    user_id = request.args.get("userId")
    lesson_id = request.args.get("lessonId")
    if not user_id or not lesson_id:
        return jsonify({"message": "userId and lessonId are required"}), 400
    _student, err = _authorize_student_access(g.current_user.get("sub"), user_id)
    if err:
        return err
    lesson_id = str(lesson_id)

    try:
        before = int(request.args.get("before", ""))
    except ValueError:
        return jsonify({"message": "before must be an integer attemptNumber"}), 400

    query = {"userId": user_id, "lessonId": lesson_id}
    projection = {"_id": 0}

    first = lesson_attempts_collection.find_one(query, projection, sort=[("attemptNumber", 1)])
    if first and first.get("attemptNumber") == before:
        first = None

    previous = lesson_attempts_collection.find_one(
        {**query, "attemptNumber": {"$lt": before}}, projection, sort=[("attemptNumber", -1)]
    )

    return jsonify({"first": first, "previous": previous}), 200


@lesson_attempt_bp.route("/api/user/student/<student_id>/attempts", methods=["GET"])
@requires_auth
def get_student_attempts(student_id):
    _student, err = _authorize_student_access(g.current_user.get("sub"), student_id)
    if err:
        return err

    try:
        limit = min(MAX_ATTEMPTS_LIMIT, max(1, int(request.args.get("limit", DEFAULT_ATTEMPTS_LIMIT))))
    except ValueError:
        return jsonify({"message": "limit must be an integer"}), 400

    query = {"userId": student_id}
    before = request.args.get("before")
    if before:
        query["createdAt"] = {"$lt": before}

    cursor = (
        lesson_attempts_collection.find(query, {"_id": 0})
        .sort("createdAt", -1)
        .limit(limit)
    )
    return jsonify({"attempts": list(cursor)}), 200

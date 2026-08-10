from flask import Blueprint, request, jsonify
from database import lesson_attempts_collection
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError

lesson_attempt_bp = Blueprint("lesson_attempt_bp", __name__)

VALID_STATUSES = {"completed", "failed"}

MAX_ATTEMPT_NUMBER_RETRIES = 3


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


@lesson_attempt_bp.route("/api/user/lessonAttempts", methods=["POST"])
def save_lesson_attempt():
    data = request.get_json(silent=True) or {}
    user_id = data.get("userId")
    lesson_id = data.get("lessonId")
    status = data.get("status")

    if not user_id or lesson_id is None:
        return jsonify({"message": "userId and lessonId are required"}), 400
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
def get_lesson_attempts():
    user_id = request.args.get("userId")
    lesson_id = request.args.get("lessonId")
    if not user_id or not lesson_id:
        return jsonify({"message": "userId and lessonId are required"}), 400
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

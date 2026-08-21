from flask import Blueprint, request, jsonify, g
from database import users_collection
from datetime import datetime
from auth import requires_auth

score_bp = Blueprint("score_bp", __name__)

def update_running_average(category_list, key_name, key_value, score):
    """
    Updates a running average for a category in user progress.
    
    Args:
        category_list: list of dicts, e.g., user['progress']['phonemeScores']
        key_name: str, e.g., "phoneme", "type", "syllables", "position"
        key_value: value to match in list, e.g., "l", "plosive", 2, "initial"
        score: float, new score to incorporate (0-1)
    """
    for item in category_list:
        if item[key_name] == key_value:
            # Update running average
            item["avgScore"] = (item["avgScore"] * item["attempts"] + score) / (item["attempts"] + 1)
            item["attempts"] += 1
            return
    # If not found, add new entry
    category_list.append({
        key_name: key_value,
        "avgScore": score,
        "attempts": 1
    })


@score_bp.route("/api/scoreAudio", methods=["POST"])
@requires_auth
def score_audio():
    data = request.get_json()

    # --- Basic input validation ---
    required_fields = ["userId", "word", "phoneme", "position", "soundType", "score"]
    for field in required_fields:
        if field not in data:
            return jsonify({"message": f"Missing field: {field}"}), 400

    user_id = data["userId"]
    if g.current_user.get("sub") != user_id:
        return jsonify({"message": "Not authorized for this user"}), 403

    word = data["word"]
    phoneme = data["phoneme"]
    position = data["position"]
    sound_type = data["soundType"]
    score = data["score"]

    # Validate score range
    if not isinstance(score, (int, float)) or not (0 <= score <= 1):
        return jsonify({"message": "Score must be a number between 0 and 1"}), 400

    # For now, approximate syllables as word length; replace later with better method
    syllables = len(word)

    # --- Fetch user ---
    user = users_collection.find_one({"userId": user_id})
    if not user:
        return jsonify({"message": "User not found"}), 404

    # progress.{syllableScores,positionScores,soundTypeScores} aren't part of
    # the default user schema (see _default_user_doc in user_routes.py, which
    # only creates phonemeScores/wordScores) - default them to an empty list
    # instead of indexing directly, or every real account 500s here.
    progress = user.setdefault("progress", {})
    progress.setdefault("phonemeScores", [])
    progress.setdefault("syllableScores", [])
    progress.setdefault("positionScores", [])
    progress.setdefault("soundTypeScores", [])

    # --- Update running averages ---
    update_running_average(progress["phonemeScores"], "phoneme", phoneme, score)
    update_running_average(progress["syllableScores"], "syllables", syllables, score)
    update_running_average(progress["positionScores"], "position", position, score)
    update_running_average(progress["soundTypeScores"], "type", sound_type, score)

    # --- Update history and lastUpdated ---
    users_collection.update_one(
        {"userId": user_id},
        {
            "$set": {
                "progress": user["progress"],
                "lastUpdated": datetime.now().strftime("%Y-%m-%d")
            },
            "$push": {
                "history": {
                    "word": word,
                    "phoneme": phoneme,
                    "position": position,
                    "soundType": sound_type,
                    "score": score,
                    "timestamp": datetime.now().strftime("%Y-%m-%d")
                }
            }
        }
    )

    # Return updated progress for frontend convenience
    return jsonify({
        "message": "Score added and progress updated",
        "progress": user["progress"]
    }), 200

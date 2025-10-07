from flask import Blueprint, request, jsonify
from database import users_collection
from datetime import datetime

score_bp = Blueprint("score_bp", __name__)

@score_bp.route("/api/scoreAudio", methods=["POST"])
def score_audio():
    data = request.get_json()
    user_id = data["userId"]
    word = data["word"]
    phoneme = data["phoneme"]
    position = data["position"]
    sound_type = data["soundType"]
    score = data["score"]

    users_collection.update_one(
        {"userId": user_id},
        {"$push": {"history": {
            "word": word,
            "phoneme": phoneme,
            "position": position,
            "soundType": sound_type,
            "score": score,
            "timestamp": datetime.now().strftime("%Y-%m-%d")
        }},
         "$set": {"lastUpdated": datetime.now().strftime("%Y-%m-%d")}}
    )

    return jsonify({"message": "Score added"}), 200
from flask import Blueprint, request, jsonify
from database import users_collection
from datetime import datetime
from groq import Groq
import os

user_bp = Blueprint("user_bp", __name__)

# Default categories for new users
DEFAULT_PHONEMES = ["l", "r", "s", "th", "ch", "sh"]  # add more as needed
DEFAULT_POSITIONS = ["initial", "medial", "final"]
DEFAULT_SOUND_TYPES = ["plosive", "fricative", "nasal", "liquid", "glide", "vowel"]
DEFAULT_SYLLABLES = [1, 2, 3]  # word length


def create_default_progress():
    """Initialize default progress structure for a new user."""
    return {
        "phonemeScores": [{"phoneme": p, "avgScore": 0, "attempts": 0} for p in DEFAULT_PHONEMES],
        "syllableScores": [{"syllables": s, "avgScore": 0, "attempts": 0} for s in DEFAULT_SYLLABLES],
        "positionScores": [{"position": pos, "avgScore": 0, "attempts": 0} for pos in DEFAULT_POSITIONS],
        "soundTypeScores": [{"type": t, "avgScore": 0, "attempts": 0} for t in DEFAULT_SOUND_TYPES]
    }


@user_bp.route("/api/createUser", methods=["POST"])
def create_user():
    data = request.get_json() or {}
    user_id = data.get("userId")
    name = data.get("name") or ""
    # optional fields with defaults
    nickname = data.get("nickname") or ""
    role = data.get("role") or "Student"
    age = data.get("age")

    if not user_id:
        return jsonify({"message": "Missing userId"}), 400

    # coerce age to int when provided, otherwise use default 16
    try:
        age_val = int(age) if age is not None and age != "" else 16
    except (ValueError, TypeError):
        age_val = 16

    new_user = {
        "userId": user_id,
        "name": name or nickname or "Unnamed",
        "nickname": nickname,
        "role": role,
        "age": age_val,
        "progress": create_default_progress(),
        "history": [],
        "lastUpdated": datetime.now().strftime("%Y-%m-%d")
    }

    try:
        result = users_collection.update_one(
            {"userId": user_id},
            {"$setOnInsert": new_user},
            upsert=True
        )
    except Exception as e:
        return jsonify({"message": "Database error", "error": str(e)}), 500

    if getattr(result, "upserted_id", None):
        return jsonify({"message": "User created successfully"}), 201
    else:
        return jsonify({"message": "User already exists"}), 200


@user_bp.route("/api/updateUserProfile", methods=["POST"])
def update_user_profile():
    """
    Update editable profile fields for a user (nickname, age, role, name).
    Expects JSON: { userId, nickname?, age?, role?, name? }
    """
    data = request.get_json() or {}
    user_id = data.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId"}), 400

    update_fields = {}
    if "nickname" in data:
        update_fields["nickname"] = data.get("nickname", "")
    if "age" in data:
        update_fields["age"] = data.get("age")
    if "role" in data:
        update_fields["role"] = data.get("role")
    if "name" in data:
        update_fields["name"] = data.get("name")

    if not update_fields:
        return jsonify({"message": "No updatable fields provided"}), 400

    try:
        result = users_collection.update_one(
            {"userId": user_id},
            {"$set": update_fields}
        )
    except Exception as e:
        return jsonify({"message": "Database error", "error": str(e)}), 500

    if result.matched_count == 0:
        return jsonify({"message": "User not found"}), 404

    return jsonify({"message": "Profile updated"}), 200


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
        "lastUpdated": user["lastUpdated"]
    }), 200


# Add this new endpoint to return the user's profile data (no _id)
@user_bp.route("/api/getUserProfile", methods=["GET"])
def get_user_profile():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId query parameter"}), 400

    user = users_collection.find_one({"userId": user_id}, {"_id": 0})
    if not user:
        return jsonify({"message": "User not found"}), 404

    return jsonify(user), 200


def get_weak_areas(progress):
    """Return weak phonemes, sound types, and positions (avgScore < 0.7)."""
    weak_phonemes = [p["phoneme"] for p in progress["phonemeScores"] if p["avgScore"] < 0.7]
    weak_types = [t["type"] for t in progress["soundTypeScores"] if t["avgScore"] < 0.7]
    weak_positions = [p["position"] for p in progress["positionScores"] if p["avgScore"] < 0.7]
    return weak_phonemes, weak_types, weak_positions


@user_bp.route("/api/getNextLesson", methods=["GET"])
def get_next_lesson():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"message": "Missing userId parameter"}), 400

    user = users_collection.find_one({"userId": user_id}, {"_id": 0})
    if not user:
        return jsonify({"message": "User not found"}), 404

    progress = user["progress"]
    weak_phonemes, weak_types, weak_positions = get_weak_areas(progress)

    # Build prompt for Groq AI
    prompt_parts = []
    if weak_phonemes:
        prompt_parts.append(f"focus on phonemes: {', '.join(weak_phonemes)}")
    if weak_types:
        prompt_parts.append(f"sound types: {', '.join(weak_types)}")
    if weak_positions:
        prompt_parts.append(f"positions in word: {', '.join(weak_positions)}")

    prompt_details = "; ".join(prompt_parts) if prompt_parts else "general practice"
    prompt = f"Generate a list of 8-16 words in JSON format {{1: 'word', 2: 'word', ...}} for speech therapy. The lesson should target {prompt_details}."

    # Call Groq AI
    try:
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"}
        )
        lesson_words = chat_completion.choices[0].message.content
    except Exception as e:
        return jsonify({"message": "Error generating lesson", "error": str(e)}), 500

    return jsonify({
        "userId": user_id,
        "lessonWords": lesson_words
    }), 200

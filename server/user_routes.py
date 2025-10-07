from flask import Blueprint, request, jsonify
from database import users_collection
from datetime import datetime

user_bp = Blueprint("user_bp", __name__)

@user_bp.route("/api/createUser", methods=["POST"])
def create_user():
    data = request.get_json()
    user_id = data.get("userId")
    name = data.get("name")
    age = data.get("age")

    user = users_collection.find_one({"userId": user_id})
    if user:
        return jsonify({"message": "User already exists"}), 200

    new_user = {
        "userId": user_id,
        "name": name,
        "age": age,
        "progress": {
            "phonemeScores": [],
            "syllableScores": [],
            "positionScores": [],
            "soundTypeScores": []
        },
        "history": [],
        "lastUpdated": datetime.now().strftime("%Y-%m-%d")
    }

    users_collection.insert_one(new_user)
    return jsonify({"message": "User created successfully"}), 201

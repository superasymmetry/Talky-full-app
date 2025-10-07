from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv
from database import users_collection
from user_routes import user_bp
from score_routes import score_bp

load_dotenv()

app = Flask(__name__)
cors = CORS(app, origin="*")

# Register routes
app.register_blueprint(user_bp)
app.register_blueprint(score_bp)

@app.route('/api/lessons', methods=['GET'])
def lessons():
    data = [{"id": 1, "title": "lorem ipsum", "content": "blah"}]
    return jsonify(data)

@app.route('/api/wordbank', methods=['GET', 'POST'])
def wordbank():
    if request.method == 'POST':
        category = request.json.get('category', 'general')
    else:
        category = request.args.get('category', 'general')
    model = "llama-3.1-8b-instant"
    prompt = f'Your task is to generate words for someone to practice speech therapy. Please generate a list of 16 words in only json and in the json format {{1: "first word", 2: "second word", 3: "third word", ...}} used to practice the category: {category}'
    client = Groq(
        api_key=os.environ.get("GROQ_API_KEY"),
    )

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        model=model,
        response_format={
            "type": "json_object",
        }
    )
    return jsonify(chat_completion.choices[0].message.content)

@app.route("/")
def home():
    users = list(users_collection.find({}, {"_id": 0}))  # exclude MongoDB's _id field for readability
    return jsonify(users)

@app.route("/add_user", methods=["POST"])
def add_user():
    data = request.get_json()
    users_collection.insert_one(data)
    return jsonify({"message": "User added successfully!"})

if __name__ == '__main__':
    app.run(port=8080, debug=True)
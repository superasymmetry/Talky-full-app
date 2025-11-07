from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv
# import database
from user_routes import user_bp
from score_routes import score_bp
from gop_eval import compute_pronunciation_score

load_dotenv()

app = Flask(__name__)
cors = CORS(app, origin="*")

# Register routes
app.register_blueprint(user_bp)
app.register_blueprint(score_bp)

@app.route('/api/lessons', methods=['GET', 'POST'])
def lessons():
    # dummy word list. would replace with actual list from db or request
    word_list = ["rainbow", "racecar", "rocket", "rabbit", "ring", "road", "rose"]
    
    prompt = f"""
    Your tasks is to generate a list of 7 sentences for speech therapy practice. 
    Please generate ethe sentences based on these words: {word_list}.
    Each sentence should be between 5-10 words long. Please return the sentences in JSON format as follows:
    {{
        1: "first sentence",
        2: "second sentence",
        ...
        7: "seventh sentence"
        }}
    """
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.1-8b-instant",
        response_format={"type": "json_object"}
    )

    sentences = jsonify(chat_completion.choices[0].message.content)
    print(sentences)
    return sentences

@app.route('/api/wordbank', methods=['GET', 'POST'])
def wordbank():
    if request.method == 'POST':
        category = request.json.get('category', 'general')
    else:
        category = request.args.get('category', 'general')

    model = "llama-3.1-8b-instant"

    # Updated prompt: include emojis for each word
    prompt = f"""
    Your task is to generate 16 words for speech therapy practice. 
    Return your output **only** as a JSON object in this format:

    {{
    1: {{"word": "first word", "emoji": "🍎"}},
    2: {{"word": "second word", "emoji": "🐶"}},
    ...
    16: {{"word": "sixteenth word", "emoji": "🚀"}}
    }}

    Follow these strict rules:
    - The words must fit the category: {category}.
    - For phoneme-specific categories (e.g., "L-sounds"), vary the number of syllables (1-3) and the phoneme position (initial, medial, final).
    - Each emoji **must directly represent** the word — for example:
    - "cat" → 🐱
    - "apple" → 🍎
    - "rain" → 🌧️
    - "star" → ⭐
    - Do not use abstract words or emojis that don't visually match.
    - Output must be valid JSON, with no text outside the JSON.
    """

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        response_format={"type": "json_object"}
    )

    return jsonify(chat_completion.choices[0].message.content)

@app.route("/")
def home():
    users = list(users_collection.find({}, {"_id": 0}))
    return jsonify(users)

@app.route("/add_user", methods=["POST"])
def add_user():
    data = request.get_json()
    users_collection.insert_one(data)
    return jsonify({"message": "User added successfully!"})

@app.route('/api/evaluate', methods=['POST'])
def evaluate():
    audio = request.files.get('audio')

    if not audio:
        return jsonify({"error": "No audio file provided"}), 400

    # Define the path to save the audio file
    audio_path = "audio.wav"
    try:
        # Call the compute_pronunciation_score function
        transcription, score = compute_pronunciation_score(audio_path, "hello")
        return jsonify({"score": score, "transcription": transcription})
    except Exception as e:
        # Log the error for debugging
        print(f"Error during evaluation: {e}")
        return jsonify({"error": str(e)}), 500
    

if __name__ == '__main__':
    app.run(port=8080, debug=True, use_reloader=False)

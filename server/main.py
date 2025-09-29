from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
cors = CORS(app, origin="*")

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
    prompt = f'Your task is to generate words for someone to practice speech therapy. Please generate a list of 15 words in only json and in the json format {{1: "first word", 2: "second word", 3: "third word", ...}} used to practice the category: {category}'
    print(os.environ.get("GROQ_API_KEY"))
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
    )

    return jsonify(chat_completion.choices[0].message.content)

if __name__ == '__main__':
    app.run(port=8080, debug=True)
from flask import Flask, request, jsonify, Response
from flask_cors import CORS

app = Flask(__name__)
cors = CORS(app, origin="*")

@app.route('/lessons', methods=['GET'])
def lessons():
    data = [{"id": 1, "title": "lorem ipsum", "content": "blah"}]
    return jsonify(data)
    
if __name__ == '__main__':
    app.run(port=8080, debug=True)
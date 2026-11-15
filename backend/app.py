from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)

CORS(app, supports_credentials=True)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "data": {
            "message": "backend is running"
        }
    }), 200

if __name__ == "__main__":
    app.run(debug=True)
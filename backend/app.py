import os
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS


# .env 파일의 값을 환경 변수로 불러옴 (os.getenv로 읽기 위해 필요)
load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")

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
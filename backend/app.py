import os
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from firebase import init_firebase
from routes.auth import auth_bp
from routes.users import users_bp
from routes.rankings import rankings_bp
from routes.reviews import reviews_bp
from routes.schedules import schedules_bp
from routes.cart_items import cart_items_bp
from routes.orders import orders_bp
from utils.exceptions import AppError
from utils.response import error


# .env 파일의 값을 환경 변수로 불러옴 (os.getenv로 읽기 위해 필요)
load_dotenv()
init_firebase()

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


app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(rankings_bp)
app.register_blueprint(reviews_bp)
app.register_blueprint(schedules_bp)
app.register_blueprint(cart_items_bp)
app.register_blueprint(orders_bp)



# service에서 던진 AppError를 공통 에러 응답으로 변환
@app.errorhandler(AppError)
def handle_app_error(e):
    return error(e.status, e.code, e.message)


if __name__ == "__main__":
    app.run(debug=True)
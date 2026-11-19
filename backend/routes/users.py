from flask import Blueprint, jsonify, request

from services import user_service

users_bp = Blueprint("users", __name__, url_prefix="/users")


# 이메일 중복확인 API
@users_bp.route("/check-email", methods=["GET"])
def check_email():
    user_service.check_email_available(request.args.get("email"))
    return jsonify(success=True, data=None)


# 닉네임 중복확인 API
@users_bp.route("/check-nickname", methods=["GET"])
def check_nickname():
    user_service.check_nickname_available(request.args.get("nickname"))
    return jsonify(success=True, data=None)
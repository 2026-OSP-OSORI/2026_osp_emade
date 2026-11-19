from flask import Blueprint, jsonify, request, session

from services import auth_service
from utils.auth import get_current_uid, login_required

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


# 로그인 상태 확인 API
@auth_bp.route("/me", methods=["GET"])
def me():
    uid = get_current_uid()
    return jsonify(success=True, data={"isLoggedIn": uid is not None, "uid": uid}) # 자동으로 상태코드 200


# 회원가입 API
@auth_bp.route("/signup", methods=["POST"])
def signup():
    body = request.get_json(silent=True) or {}
    auth_service.signup(body.get("nickname"), body.get("email"), body.get("password"))
    return jsonify(success=True, data=None), 201


# 로그인 API
@auth_bp.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    uid = auth_service.login(body.get("email"), body.get("password"))
    session["uid"] = uid
    return jsonify(success=True, data=None)


# 로그아웃 API
@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    return jsonify(success=True, data=None)
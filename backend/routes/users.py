from flask import Blueprint, jsonify, request

from utils.auth import get_current_uid, login_required

from services import user_service, follow_service

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


# 마이페이지 내정보 요약 API
@users_bp.route("/me", methods=["GET"])
@login_required
def my_summary():
    data = user_service.get_my_summary(get_current_uid())
    return jsonify(success=True, data=data)


# 닉네임 변경 API
@users_bp.route("/me/nickname", methods=["PATCH"])
@login_required
def change_nickname():
    body = request.get_json(silent=True) or {}
    user_service.change_nickname(get_current_uid(), body.get("nickname"))
    return jsonify(success=True, data=None)


# 판매자 프로필 조회 API
@users_bp.route("/<uid>", methods=["GET"])
def seller_profile(uid):
    data = user_service.get_seller_profile(get_current_uid(), uid)
    return jsonify(success=True, data=data)


# 판매자 팔로우 API
@users_bp.route("/<uid>/follows", methods=["POST"])
@login_required
def follow_seller(uid):
    follow_service.follow(get_current_uid(), uid)
    return jsonify(success=True, data=None)


# 판매자 언팔로우 API
@users_bp.route("/<uid>/follows", methods=["DELETE"])
@login_required
def unfollow_seller(uid):
    follow_service.unfollow(get_current_uid(), uid)
    return jsonify(success=True, data=None)
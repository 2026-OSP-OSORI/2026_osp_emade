from flask import Blueprint, jsonify

from services import order_service
from utils.auth import get_current_uid, login_required

badges_bp = Blueprint("badges", __name__, url_prefix="/badges")


# 메뉴 알림(!) 조회 API
@badges_bp.route("/me", methods=["GET"])
@login_required
def my_badges():
    data = order_service.get_order_badges(get_current_uid())
    return jsonify(success=True, data=data)
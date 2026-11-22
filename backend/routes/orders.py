from flask import Blueprint, jsonify, request

from services import order_service
from utils.auth import get_current_uid, login_required

orders_bp = Blueprint("orders", __name__, url_prefix="/orders")

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


# 예약 생성 API (바로 구매는 items 1개, 장바구니는 여러 개. 하나라도 안 되면 전부 실패)
@orders_bp.route("", methods=["POST"])
@login_required
def create_orders():
    body = request.get_json(silent=True) or {}
    data = order_service.reserve(get_current_uid(), body.get("items"))
    return jsonify(success=True, data=data), 201


# 거래 내역 · 나의 거래 일정 조회 API
#   거래 내역: GET /orders?role=buying&limit=20&cursor=...
#   캘린더  : GET /orders?month=2026-11
@orders_bp.route("", methods=["GET"])
@login_required
def list_orders():
    limit = request.args.get("limit", DEFAULT_LIMIT, type=int)  # 없거나 숫자가 아니면 20
    if limit < 1:
        limit = DEFAULT_LIMIT
    limit = min(limit, MAX_LIMIT)
    data = order_service.list_orders(
        get_current_uid(),
        request.args.get("role"),
        request.args.get("month"),
        limit,
        request.args.get("cursor"),
    )
    return jsonify(success=True, data=data)


# 거래 내역 확인서 API (구매자·판매자만)
@orders_bp.route("/<oid>", methods=["GET"])
@login_required
def order_detail(oid):
    data = order_service.get_order_detail(get_current_uid(), oid)
    return jsonify(success=True, data=data)


# 거래 취소 API (거래 시각 전까지, 구매자·판매자 모두)
@orders_bp.route("/<oid>/cancel", methods=["PATCH"])
@login_required
def cancel_order(oid):
    data = order_service.cancel_order(oid, get_current_uid())
    return jsonify(success=True, data=data)


# 거래 확정 API (거래 시각 ~ +24시간, 둘 중 먼저 누른 사람)
@orders_bp.route("/<oid>/complete", methods=["PATCH"])
@login_required
def complete_order(oid):
    data = order_service.complete_order(oid, get_current_uid())
    return jsonify(success=True, data=data)

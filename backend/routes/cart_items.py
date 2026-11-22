from flask import Blueprint, jsonify, request

from services import cart_service
from utils.auth import get_current_uid, login_required

cart_items_bp = Blueprint("cart_items", __name__, url_prefix="/cart-items")


# 장바구니 조회 API
@cart_items_bp.route("", methods=["GET"])
@login_required
def get_cart():
    data = cart_service.get_cart(get_current_uid())
    return jsonify(success=True, data=data)


# 장바구니 담기 API (같은 상품·시간·장소면 수량만 더함)
@cart_items_bp.route("", methods=["POST"])
@login_required
def add_item():
    body = request.get_json(silent=True) or {}
    data = cart_service.add_item(get_current_uid(), body)
    return jsonify(success=True, data=data), 201


# 장바구니 항목 변경 API (수량·시간·장소 중 바꿀 것만)
@cart_items_bp.route("/<cart_key>", methods=["PATCH"])
@login_required
def update_item(cart_key):
    body = request.get_json(silent=True) or {}
    data = cart_service.update_item(get_current_uid(), cart_key, body)
    return jsonify(success=True, data=data)


# 장바구니 항목 삭제 API (선택 삭제 포함, body에 cartKeys)
@cart_items_bp.route("", methods=["DELETE"])
@login_required
def delete_items():
    body = request.get_json(silent=True) or {}
    cart_service.delete_items(get_current_uid(), body.get("cartKeys"))
    return jsonify(success=True, data=None)

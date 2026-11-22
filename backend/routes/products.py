from flask import Blueprint, jsonify, request

from services import product_service
from utils.auth import get_current_uid, login_required

products_bp = Blueprint("products", __name__, url_prefix="/products")


@products_bp.route("", methods=["POST"])
@login_required
def create_product():
    data = product_service.create_product(
        get_current_uid(), request.form, request.files.getlist("images")
    )
    return jsonify(success=True, data=data), 201


@products_bp.route("", methods=["GET"])
def list_products():
    data = product_service.list_products(get_current_uid(), request.args)
    return jsonify(success=True, data=data), 200


@products_bp.route("/<pid>", methods=["GET"])
def get_product(pid):
    data = product_service.get_product(get_current_uid(), pid)
    return jsonify(success=True, data=data), 200


@products_bp.route("/<pid>", methods=["PATCH"])
@login_required
def update_product(pid):
    data = product_service.update_product(
        get_current_uid(), pid, request.form, request.files.getlist("images")
    )
    return jsonify(success=True, data=data), 200


@products_bp.route("/<pid>", methods=["DELETE"])
@login_required
def delete_product(pid):
    product_service.delete_product(get_current_uid(), pid)
    return jsonify(success=True, data=None), 200

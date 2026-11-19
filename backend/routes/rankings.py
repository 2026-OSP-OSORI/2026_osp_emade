from flask import Blueprint, jsonify, request

from services import ranking_service

rankings_bp = Blueprint("rankings", __name__, url_prefix="/rankings")


# 인기 판매자 목록 API
@rankings_bp.route("/sellers", methods=["GET"])
def top_sellers():
    limit = request.args.get("limit", 6, type=int) # 없거나 숫자가 아니면 6
    if limit < 1:
        limit = 6
    data = ranking_service.get_top_sellers(limit)
    return jsonify(success=True, data=data)
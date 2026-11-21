from flask import Blueprint, jsonify, request

from services import review_service
from utils.auth import get_current_uid, login_required

reviews_bp = Blueprint("reviews", __name__) # 주소가 섞여 있어서 prefix 없음


# page, limit 꺼내기
def _page_args(default_limit):
    page = request.args.get("page", 1, type=int) # 없으면 1, int로 변환
    limit = request.args.get("limit", default_limit, type=int) # limit이 없으면 10
    # 잘못된 값은 기본값으로
    if page < 1:
        page = 1
    if limit < 1:
        limit = default_limit
    return page, limit


# 상품별 리뷰 목록 API
@reviews_bp.route("/products/<pid>/reviews", methods=["GET"])
def product_reviews(pid):
    page, limit = _page_args(10)
    sort = request.args.get("sort", "latest")
    photo_only = request.args.get("photoOnly", "false").lower() == "true"
    data = review_service.get_product_reviews(get_current_uid(), pid, sort, photo_only, page, limit)
    return jsonify(success=True, data=data)


# 상품 리뷰 별점 요약 API
@reviews_bp.route("/products/<pid>/reviews/summary", methods=["GET"])
def review_summary(pid):
    data = review_service.get_review_summary(pid)
    return jsonify(success=True, data=data)


# 리뷰 상세 API
@reviews_bp.route("/reviews/<rid>", methods=["GET"])
def review_detail(rid):
    data = review_service.get_review_detail(get_current_uid(), rid)
    return jsonify(success=True, data=data)


# 내가 쓴 리뷰 목록 API
@reviews_bp.route("/users/me/reviews", methods=["GET"])
@login_required
def my_reviews():
    page, limit = _page_args(5)
    sort = request.args.get("sort", "latest")
    data = review_service.get_my_reviews(get_current_uid(), sort, page, limit)
    return jsonify(success=True, data=data)
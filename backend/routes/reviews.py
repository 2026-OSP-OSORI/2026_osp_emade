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


# 리뷰 작성 API
@reviews_bp.route("/reviews", methods=["POST"])
@login_required
def create_review():
    rid = review_service.create_review(
        get_current_uid(),
        request.form.get("oid"),
        request.form.get("title"),
        request.form.get("rating"),
        request.form.get("content"),
        request.files.getlist("images"),
    )
    return jsonify(success=True, data={"rid": rid}), 201


# 리뷰 수정 API
@reviews_bp.route("/reviews/<rid>", methods=["PATCH"])
@login_required
def update_review(rid):
    review_service.update_review(
        get_current_uid(),
        rid,
        request.form.get("title"),
        request.form.get("rating"),
        request.form.get("content"),
        request.form.getlist("keepImages"),
        request.files.getlist("images"),
    )
    return jsonify(success=True, data=None)


# 리뷰 삭제 API
@reviews_bp.route("/reviews/<rid>", methods=["DELETE"])
@login_required
def delete_review(rid):
    review_service.delete_review(get_current_uid(), rid)
    return jsonify(success=True, data=None)


# 도움돼요 API
@reviews_bp.route("/reviews/<rid>/helpful", methods=["POST"])
@login_required
def add_helpful(rid):
    review_service.add_helpful(get_current_uid(), rid)
    return jsonify(success=True, data=None)


# 도움돼요 취소 API
@reviews_bp.route("/reviews/<rid>/helpful", methods=["DELETE"])
@login_required
def remove_helpful(rid):
    review_service.remove_helpful(get_current_uid(), rid)
    return jsonify(success=True, data=None)


# 판매자 답글 작성 API
@reviews_bp.route("/reviews/<rid>/reply", methods=["POST"])
@login_required
def add_seller_reply(rid):
    data = request.get_json(silent=True) or {}
    result = review_service.add_seller_reply(get_current_uid(), rid, data.get("content"))
    return jsonify(success=True, data=result), 201
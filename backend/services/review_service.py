from firebase_admin import db

from utils.exceptions import AppError
from utils.time_utils import ms_to_iso

PHOTO_PREVIEW_LIMIT = 6


# DB에서 리뷰 가져오기
def _get_review(rid):
    return db.reference(f"reviews/{rid}").get()


# DB에서 상품 가져오기
def _get_product(pid):
    return db.reference(f"products/{pid}").get()


# DB에서 활성화된 상품 가져오기 (없거나 삭제된 상품이면 404)
def _get_active_product(pid):
    product = _get_product(pid)
    if product is None or product.get("deleted"):
        raise AppError(404, "PRODUCT_NOT_FOUND", "*상품을 찾을 수 없습니다.")
    return product


# DB에서 리뷰 목록 가져오기 
def _get_reviews_by_ids(rids):
    reviews = []
    for rid in rids:
        review = _get_review(rid)
        if review is not None:
            review["rid"] = rid 
            reviews.append(review) # rid를 리뷰 데이터에 포함시킴
    return reviews


# DB에서 유저 프로필 이미지 가져오기
def _user_image(uid):
    return db.reference(f"users/{uid}/profileImage").get()


# 내가 이 리뷰에 도움돼요를 눌렀는지 확인
def _is_helpful(my_uid, rid):
    if my_uid is None:
        return False
    return db.reference(f"reviewHelpful/{rid}/{my_uid}").get() is not None


# 내가 이 상품에 좋아요를 눌렀는지 확인
def _is_liked(my_uid, pid):
    return db.reference(f"likes/{my_uid}/{pid}").get() is not None


# 대표 사진 가져오기 (사진이 없으면 None)
def _first_image(images):
    if images:
        return images[0] # 0번 인덱스의 사진을 대표 사진으로 사용
    return None


# 리뷰 평균 별점 계산 (소수점 1자리)
def _average_rating(product):
    count = product.get("reviewCount", 0)
    if count == 0:
        return 0
    return round(product.get("ratingSum", 0) / count, 1)


# 리뷰 중 사진이 1장 이상인 리뷰만 골라내기
def _photo_reviews(reviews):
    result = []
    for review in reviews:
        if review.get("images"):
            result.append(review)
    return result


# 리뷰 점수별 비율(%) 계산 (리뷰가 없으면 전부 0.0)
def _rating_distribution(reviews):
    counts = {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}
    for review in reviews:
        score = str(review.get("rating"))
        if score in counts:
            counts[score] += 1

    distribution = {}
    for score in counts:
        if len(reviews) == 0:
            distribution[score] = 0.0
        else:
            distribution[score] = round(counts[score] / len(reviews) * 100, 1)
    return distribution


# 최신 포토 리뷰 몇 개의 대표 사진
def _photo_previews(photo_reviews):
    _sort_reviews(photo_reviews, "latest")
    previews = []
    for review in photo_reviews[:PHOTO_PREVIEW_LIMIT]:
        previews.append({"rid": review["rid"], "image": review["images"][0]})
    return previews


# createdAt 기준으로 정렬하기 위한 헬퍼 함수
def _created_at(review):
    return review.get("createdAt", 0)


# rating 기준으로 정렬하기 위한 헬퍼 함수
def _rating(review):
    return review.get("rating", 0)


# helpfulCount 기준으로 정렬하기 위한 헬퍼 함수
def _helpful_count(review):
    return review.get("helpfulCount", 0)


# 리뷰 정렬
def _sort_reviews(reviews, sort):
    # 1단계: 일단 최신순으로 정렬 -> 기준 값이 같은 리뷰끼리 최신순 유지 목적
    reviews.sort(key=_created_at, reverse=True)

    # 2단계: 기준대로 다시 정렬
    if sort == "oldest": # 오래된 순
        reviews.sort(key=_created_at)
        
    elif sort == "rating_high": # 높은 평점 순
        reviews.sort(key=_rating, reverse=True)
        
    elif sort == "rating_low": # 낮은 평점 순
        reviews.sort(key=_rating)
        
    elif sort == "helpful": # 도움돼요 순
        reviews.sort(key=_helpful_count, reverse=True)
        
    # 그 외 값(latest, 잘못된 값)은 1단계 최신순 그대로


# 페이지네이션 
def _paginate(items, page, limit):
    start = (page - 1) * limit
    end = start + limit
    return items[start:end]


# 상품별 리뷰 목록 가져오기
def get_product_reviews(my_uid, pid, sort, photo_only, page, limit):
    _get_active_product(pid) # 없거나 삭제된 상품이면 404

    rids = db.reference(f"productReviews/{pid}").get() or {}
    reviews = _get_reviews_by_ids(rids)

    if photo_only:
        reviews = _photo_reviews(reviews)

    _sort_reviews(reviews, sort)

    items = []
    for review in _paginate(reviews, page, limit):
        items.append({
            "rid": review["rid"],
            "uid": review.get("uid"),
            "userNickname": review.get("userNickname"),
            "userImage": _user_image(review.get("uid")),
            "title": review.get("title"),
            "rating": review.get("rating"),
            "content": review.get("content"),
            "images": review.get("images") or [],
            "helpfulCount": review.get("helpfulCount", 0),
            "isHelpful": _is_helpful(my_uid, review["rid"]),
            "createdAt": ms_to_iso(review.get("createdAt")),
        })

    return {"total": len(reviews), "page": page, "reviews": items}


# 상품 리뷰 별점 요약 가져오기
def get_review_summary(pid):
    product = _get_active_product(pid)

    rids = db.reference(f"productReviews/{pid}").get() or {}
    reviews = _get_reviews_by_ids(rids)
    photo_reviews = _photo_reviews(reviews)

    return {
        "averageRating": _average_rating(product),
        "reviewCount": product.get("reviewCount", 0),
        "ratingDistribution": _rating_distribution(reviews),
        "photoReviewCount": len(photo_reviews),
        "photoPreviews": _photo_previews(photo_reviews),
    }


# 리뷰 상세 가져오기
def get_review_detail(my_uid, rid):
    review = _get_review(rid)
    if review is None:
        raise AppError(404, "REVIEW_NOT_FOUND", "*리뷰를 찾을 수 없습니다.")

    pid = review.get("pid")
    product = _get_product(pid) or {}

    return {
        "rid": rid,
        "oid": review.get("orderId"),
        "uid": review.get("uid"),
        "userNickname": review.get("userNickname"),
        "userImage": _user_image(review.get("uid")),
        "title": review.get("title"),
        "rating": review.get("rating"),
        "content": review.get("content"),
        "images": review.get("images") or [],
        "helpfulCount": review.get("helpfulCount", 0),
        "isHelpful": _is_helpful(my_uid, rid),
        "createdAt": ms_to_iso(review.get("createdAt")),
        "sellerReply": review.get("sellerReply"),
        "sellerRepliedAt": ms_to_iso(review.get("sellerRepliedAt")),
        "isMine": my_uid == review.get("uid"),
        "isSeller": my_uid == product.get("sellerId"),
        "product": {
            "pid": pid,
            "name": product.get("name"),
            "price": product.get("price"),
            "image": _first_image(product.get("images")),
            "averageRating": _average_rating(product),
            "reviewCount": product.get("reviewCount", 0),
        },
    }


# 내가 쓴 리뷰 목록 가져오기
def get_my_reviews(my_uid, sort, page, limit):
    rids = db.reference(f"userReviews/{my_uid}").get() or {}
    reviews = _get_reviews_by_ids(rids)
    _sort_reviews(reviews, sort)

    items = []
    for review in _paginate(reviews, page, limit):
        pid = review.get("pid")
        product = _get_product(pid) or {}
        items.append({
            "rid": review["rid"],
            "title": review.get("title"),
            "rating": review.get("rating"),
            "content": review.get("content"),
            "reviewImage": _first_image(review.get("images")),
            "createdAt": ms_to_iso(review.get("createdAt")),
            "product": {
                "pid": pid,
                "name": product.get("name"),
                "price": product.get("price"),
                "image": _first_image(product.get("images")),
                "sellerNickname": product.get("sellerNickname"),
                "sellerImage": product.get("sellerImage"),
                "isLiked": _is_liked(my_uid, pid),
            },
        })

    return {"total": len(reviews), "page": page, "reviews": items}
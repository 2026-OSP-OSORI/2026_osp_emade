from firebase_admin import db
import threading

from utils.exceptions import AppError
from utils.time_utils import ms_to_iso, now_ms

PHOTO_PREVIEW_LIMIT = 6
MIN_CONTENT_LENGTH = 20
MAX_REVIEW_IMAGES = 5

# 같은 주문에 리뷰 중복 작성, 상품 별점 합계가 꼬이는 걸 막는 Lock
review_lock = threading.Lock()


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


# 유효하지 않은 입력값에 대한 AppError 메시지 생성
def _invalid(message):
    return AppError(400, "INVALID_REVIEW_DATA", message)


# 별점 입력값 검사 및 변환. 1~5 사이의 정수로 변환
def _parse_rating(rating):
    try:
        value = int(rating)
    except (TypeError, ValueError):
        raise _invalid("*별점을 선택해주세요.")
    if value < 1 or value > 5:
        raise _invalid("*별점을 선택해주세요.")
    return value


# 제목·별점·내용 검사 후 정리된 값을 반환
def _validate_review_input(title, rating, content):
    title = (title or "").strip()
    content = (content or "").strip()
    if not title or not content:
        raise AppError(400, "MISSING_REQUIRED_FIELD", "*필수 항목을 입력하세요.")

    rating = _parse_rating(rating)

    if len(content) < MIN_CONTENT_LENGTH:
        raise _invalid("*리뷰 내용을 20자 이상 입력해주세요.")

    return title, rating, content


# 업로드된 파일 중 빈 칸(파일 선택 안 함)은 빼고, 사용자가 실제로 고른 파일만 남김
def _real_files(files):
    result = []
    for file in files:
        if file.filename:
            result.append(file)
    return result


# 이미지 파일 검사. keep_count: 기존 리뷰에 남길 사진 수
def _validate_images(files, keep_count):
    if keep_count + len(files) > MAX_REVIEW_IMAGES:
        raise _invalid("*사진은 최대 5장까지 올릴 수 있어요.")
    for file in files:
        if not file.mimetype or not file.mimetype.startswith("image/"): # mimetype이 없거나 image/로 시작하지 않으면 이미지 아님 
            raise _invalid("*올바른 이미지 파일을 등록해주세요.")


# 이미지 업로드. 백2 이미지 업로드 방식 확정 후 구현
def _upload_images(files):
    if not files:
        return []
    raise NotImplementedError("이미지 업로드는 백2 방식 확정 후 구현")


# 리뷰 작성 가능 주문인지 확인
def _get_reviewable_order(my_uid, oid):
    order = db.reference(f"orders/{oid}").get()
    
    if order is None:
        raise AppError(404, "ORDER_NOT_FOUND", "*주문을 찾을 수 없습니다.")
    
    if order.get("buyerId") != my_uid:
        raise AppError(403, "FORBIDDEN", "*본인이 구매한 주문에만 리뷰를 쓸 수 있어요.")
    
    if order.get("status") != "COMPLETED":
        raise AppError(403, "REVIEW_NOT_ALLOWED", "*거래가 완료된 주문만 리뷰를 쓸 수 있어요.")
    
    return order


# 리뷰 작성
def create_review(my_uid, oid, title, rating, content, files):
    if not oid:
        raise AppError(400, "MISSING_REQUIRED_FIELD", "*필수 항목을 입력하세요.")
    title, rating, content = _validate_review_input(title, rating, content)
    files = _real_files(files)
    _validate_images(files, 0)
    
    order = _get_reviewable_order(my_uid, oid)
    pid = order["pid"]

    image_urls = _upload_images(files)

    with review_lock:
        # Lock 안에서 다시 확인 (동시에 두 번 눌러도 리뷰는 하나만)
        if db.reference(f"orders/{oid}/reviewId").get():
            raise AppError(409, "REVIEW_ALREADY_EXISTS", "*이미 리뷰를 작성한 주문이에요.")

        rid = db.reference("reviews").push().key # 새 리뷰 id만 받기
        created_at = now_ms()
        rating_sum = db.reference(f"products/{pid}/ratingSum").get() or 0
        review_count = db.reference(f"products/{pid}/reviewCount").get() or 0

        db.reference().update({
            f"reviews/{rid}": {
                "orderId": oid,
                "pid": pid,
                "uid": my_uid,
                "userNickname": db.reference(f"users/{my_uid}/nickname").get(),
                "title": title,
                "rating": rating,
                "content": content,
                "images": image_urls,
                "helpfulCount": 0,
                "sellerReply": None,
                "sellerRepliedAt": None,
                "createdAt": created_at,
            },
            f"productReviews/{pid}/{rid}": created_at,
            f"userReviews/{my_uid}/{rid}": created_at,
            f"orders/{oid}/reviewId": rid,
            f"products/{pid}/ratingSum": rating_sum + rating,
            f"products/{pid}/reviewCount": review_count + 1,
        })

    return rid


# 리뷰가 있고 내 것인지 확인. action: '수정' 또는 '삭제'
def _get_my_review(my_uid, rid, action):
    review = _get_review(rid)
    if review is None:
        raise AppError(404, "REVIEW_NOT_FOUND", "*리뷰를 찾을 수 없습니다.")
    if review.get("uid") != my_uid:
        raise AppError(403, "FORBIDDEN", f"*본인이 작성한 리뷰만 {action}할 수 있어요.")
    return review


# 리뷰 수정
def update_review(my_uid, rid, title, rating, content, keep_images, files):
    review = _get_my_review(my_uid, rid, "수정")
    title, rating, content = _validate_review_input(title, rating, content)

    # 남길 사진은 원래 이 리뷰에 있던 사진만 인정
    old_images = review.get("images") or []
    kept = []
    for url in keep_images:
        if url in old_images:
            kept.append(url)

    files = _real_files(files)
    _validate_images(files, len(kept))
    new_urls = _upload_images(files)

    pid = review.get("pid")

    with review_lock:
        updated_at = now_ms() # 작성일을 수정 시각으로 덮어씀
        rating_sum = db.reference(f"products/{pid}/ratingSum").get() or 0

        db.reference().update({
            f"reviews/{rid}/title": title,
            f"reviews/{rid}/rating": rating,
            f"reviews/{rid}/content": content,
            f"reviews/{rid}/images": kept + new_urls,
            f"reviews/{rid}/createdAt": updated_at,
            f"productReviews/{pid}/{rid}": updated_at,
            f"userReviews/{my_uid}/{rid}": updated_at,
            f"products/{pid}/ratingSum": rating_sum - review.get("rating", 0) + rating,
        })


# 리뷰 삭제
def delete_review(my_uid, rid):
    review = _get_my_review(my_uid, rid, "삭제")
    pid = review.get("pid")

    with review_lock:
        rating_sum = db.reference(f"products/{pid}/ratingSum").get() or 0
        review_count = db.reference(f"products/{pid}/reviewCount").get() or 0

        db.reference().update({
            f"reviews/{rid}": None,
            f"productReviews/{pid}/{rid}": None,
            f"userReviews/{my_uid}/{rid}": None,
            f"reviewHelpful/{rid}": None,
            f"orders/{review.get('orderId')}/reviewId": None,
            f"products/{pid}/ratingSum": max(rating_sum - review.get("rating", 0), 0),
            f"products/{pid}/reviewCount": max(review_count - 1, 0),
        })
import re
import threading

from services.ranking_service import get_seller_rank
from services.follow_service import is_following
from utils.time_utils import now_ms

from firebase_admin import db

from utils.exceptions import AppError

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_DOMAINS = ("ewha.ac.kr", "ewhain.net")

# 중복 검사 + 저장을 한 번에 묶기 위한 Lock (회원가입, 닉네임 변경)
user_lock = threading.Lock()


# users 노드의 주소만 가리킴 (데이터는 안 가져옴)
def users_ref():
    return db.reference("users")


# 가져온 주소의 실제 데이터(dict)를 가져옴
def _all_users():
    return users_ref().get() or {} # None 반환을 막음


# DB에서 그 이메일 가진 유저를 찾아서 uid, 유저 정보 반환하는 함수
def find_user_by_email(email):
    email = clean_email(email) # 안에서 직접 정리
    
    for uid, user in _all_users().items(): # dict를 (키, 값) 쌍으로 하나씩 꺼냄
        if user.get("email") == email:
            # user의 DB 데이터 전체(dict)를 uid와 함께 반환
            return uid, user
        
    return None, None


# DB에서 실제로 이메일 중복인지 확인하는 함수
def is_email_taken(email):
    uid, _ = find_user_by_email(email)
    return uid is not None


# DB에서 실제로 닉네임 중복인지 확인하는 함수
def is_nickname_taken(nickname):
    nickname = (nickname or "").strip() # 안에서 직접 정리
    
    for user in _all_users().values():
        if user.get("nickname") == nickname:
            return True
        
    return False

# 공백 제거 + 소문자 변환 (검사 X)
def clean_email(email):
    return (email or "").strip().lower()

# 이메일 검사 함수
def normalize_email(email):
    email = clean_email(email)
    
    # 이메일 형식 검사
    if not EMAIL_PATTERN.match(email):
        raise AppError(400, "INVALID_EMAIL_FORMAT", "*올바른 이메일 형식이 아닙니다.")
    
    # 이화여대 이메일 도메인 검사
    if email.split("@")[1] not in ALLOWED_DOMAINS:
        raise AppError(400, "INVALID_EMAIL_DOMAIN", "*이화여대 이메일 형식으로 입력하세요.")
    
    return email

# 닉네임 정규화 함수
def normalize_nickname(nickname):
    # 공백 제거
    nickname = (nickname or "").strip()
    
    if not nickname:
        raise AppError(400, "MISSING_REQUIRED_FIELD", "*필수 항목을 입력하세요.")
    
    return nickname

# 이메일 중복 검사 + 겹치면 에러 던지기 -> API에서 호출
def check_email_available(email):
    email = normalize_email(email)
    
    if is_email_taken(email):
        raise AppError(409, "EMAIL_ALREADY_EXISTS", "*이미 사용 중인 이메일입니다.")


# 빈 값 검사 + 중복 확인 + 겹치면 에러 던지기 -> API에서 호출
def check_nickname_available(nickname):
    nickname = normalize_nickname(nickname)
    
    if is_nickname_taken(nickname):
        raise AppError(409, "NICKNAME_ALREADY_EXISTS", "*이미 사용 중인 닉네임입니다.")
    

# 상품이 삭제되었는지 확인하는 함수
def _is_deleted_product(pid):
    return bool(db.reference(f"products/{pid}/deleted").get())


# 삭제되지 않은 상품 개수 (판매 상태 무관, 등록 상품 수/찜 개수에 사용)
def _count_active_products(pids):
    count = 0
    for pid in pids:
        if not _is_deleted_product(pid): # 삭제 안 됐으면
            count += 1
    return count


# 거래 전 일정 수를 세는 함수
def _count_upcoming_schedules(orders_by_role):
    now = now_ms()
    count = 0
    for orders in orders_by_role.values(): # buying, selling
        for oid, trade_start_at in orders.items():
            if trade_start_at <= now: # 이미 지난 일정이면 스킵
                continue
            if db.reference(f"orders/{oid}/status").get() == "CONFIRMED": # CONFIRMED 상태 + 거래 시각 아직 안 지난 주문
                count += 1
    return count


# 마이페이지에 띄울 사용자 정보 가져오기
def get_my_summary(uid):
    user = users_ref().child(uid).get()
    
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "*존재하지 않는 사용자입니다.")

    my_products = db.reference(f"userProducts/{uid}").get() or {}
    my_likes = db.reference(f"likes/{uid}").get() or {}
    my_orders = db.reference(f"userOrders/{uid}").get() or {}
    my_reviews = db.reference(f"userReviews/{uid}").get() or {}

    return {
        "uid": uid,
        "nickname": user.get("nickname"),
        "profileImage": user.get("profileImage"),
        "sellerRank": get_seller_rank(uid),
        "followingCount": user.get("followingCount", 0),
        "followerCount": user.get("followerCount", 0),
        "stats": {
            "scheduleCount": _count_upcoming_schedules(my_orders),
            "likeCount": _count_active_products(my_likes),
            "productCount": _count_active_products(my_products),
            "orderCount": sum(len(orders) for orders in my_orders.values()),
            "reviewCount": len(my_reviews),
        },
    }


# 닉네임 변경 함수
def change_nickname(uid, nickname):
    nickname = normalize_nickname(nickname)

    with user_lock:
        current = users_ref().child(uid).child("nickname").get()
        
        if current == nickname:
            return   # 지금 내 닉네임과 같으면 바꿀 것 없음

        if is_nickname_taken(nickname):
            raise AppError(409, "NICKNAME_ALREADY_EXISTS", "*이미 사용 중인 닉네임입니다.")

        updates = {f"users/{uid}/nickname": nickname}

        # 복사본 갱신 (orders는 주문 당시 기록이라 유지)
        for pid in db.reference(f"userProducts/{uid}").get() or {}:
            updates[f"products/{pid}/sellerNickname"] = nickname
        for rid in db.reference(f"userReviews/{uid}").get() or {}:
            updates[f"reviews/{rid}/userNickname"] = nickname

        db.reference().update(updates)   # multi-path update
        

# 판매자 프로필 가져오기
def get_seller_profile(my_uid, target_uid):
    user = users_ref().child(target_uid).get()
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "*존재하지 않는 사용자입니다.")

    return {
        "uid": target_uid,
        "nickname": user.get("nickname"),
        "profileImage": user.get("profileImage"),
        "sellerRank": get_seller_rank(target_uid),
        "followingCount": user.get("followingCount", 0),
        "followerCount": user.get("followerCount", 0),
        "isFollowing": is_following(my_uid, target_uid),
        "isMe": my_uid == target_uid,
    }
import hashlib

from backend.utils.time_utils import now_ms
from services.user_service import (
    find_user_by_email,
    is_email_taken,
    is_nickname_taken,
    normalize_email,
    normalize_nickname,
    user_lock,
    users_ref,
)
from utils.exceptions import AppError


def _hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def signup(nickname, email, password):
    # 필수 항목이 비어있으면 에러
    if not nickname or not email or not password:
        raise AppError(400, "MISSING_REQUIRED_FIELD", "*필수 항목을 입력하세요.")

    # 닉네임과 이메일을 정규화하고 중복 검사
    nickname = normalize_nickname(nickname)
    email = normalize_email(email)

    # Lock을 걸어 중복 검사와 저장을 한 번에 묶음
    with user_lock:
        if is_email_taken(email):
            raise AppError(409, "EMAIL_ALREADY_EXISTS", "*이미 사용 중인 이메일입니다.")
        
        if is_nickname_taken(nickname):
            raise AppError(409, "NICKNAME_ALREADY_EXISTS", "*이미 사용 중인 닉네임입니다.")

        users_ref().push({
            "pw": _hash_password(password),
            "email": email,
            "nickname": nickname,
            "profileImage": None,
            "followingCount": 0,
            "followerCount": 0,
            "soldCount": 0,
            "createdAt": now_ms(),
        })


def login(email, password):
    if not email or not password:
        raise AppError(400, "MISSING_REQUIRED_FIELD", "*필수 항목을 입력하세요.")

    uid, user = find_user_by_email(email)
    
    if uid is None or user.get("pw") != _hash_password(password):
        raise AppError(401, "INVALID_LOGIN", "*이메일 또는 비밀번호가 옳지 않습니다.")
    
    return uid
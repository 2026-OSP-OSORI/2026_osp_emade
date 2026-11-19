import re
import threading

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
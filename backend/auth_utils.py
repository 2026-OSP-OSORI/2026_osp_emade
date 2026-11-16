from functools import wraps
from flask import jsonify, session

def error(status, code, message):
    # 공통 규칙 형식의 에러 응답 생성
    return jsonify(success=False, error={"code": code, "message": message}), status


def get_current_uid():
    # 로그인한 사용자의 uid를 반환. 로그인하지 않았으면 None 반환
    return session.get("uid")


def login_required(f):
    # 로그인이 필요한 API에 붙이기, 로그인 하지 않은 요청은 401
    @wraps(f)
    def wrapper(*args, **kwargs):
        if get_current_uid() is None:
            return error(401, "LOGIN_REQUIRED", "*로그인이 필요한 기능입니다.")
        return f(*args, **kwargs)
    return wrapper
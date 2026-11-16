from flask import jsonify


def error(status, code, message):
    # 공통 규칙 형식의 에러 응답 생성
    return jsonify(success=False, error={"code": code, "message": message}), status


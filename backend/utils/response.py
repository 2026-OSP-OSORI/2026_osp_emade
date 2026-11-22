from flask import jsonify


#details 넘겨주는거 추가했음 11/21다인
def error(status, code, message, details=None):
    # 공통 규칙 형식의 에러 응답 생성. details가 있으면 error.details로 같이 보냄
    body = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return jsonify(success=False, error=body), status

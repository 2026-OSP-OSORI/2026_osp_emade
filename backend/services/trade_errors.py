"""
거래(스케줄·장바구니·주문) API 에러 목록 — API 명세 공통 에러표 그대로

    raise trade_error("OUT_OF_STOCK", {"index": 0})
"""

from utils.exceptions import AppError

_ERRORS = {
    "LOGIN_REQUIRED": (401, "*로그인이 필요한 기능입니다."),
    "FORBIDDEN": (403, "*접근 권한이 없습니다."),
    "MISSING_REQUIRED_FIELD": (400, "*필수 항목을 입력하세요."),
    "PRODUCT_NOT_FOUND": (404, "*상품을 찾을 수 없습니다."),
    "PRODUCT_NOT_AVAILABLE": (409, "*현재 판매 중인 상품이 아닙니다."),
    "OUT_OF_STOCK": (409, "*재고가 부족합니다."),
    "SCHEDULE_NOT_FOUND": (404, "*판매자가 거래 시간을 등록하지 않았습니다."),
    "INVALID_TIME_RANGE": (400, "*날짜 또는 시간이 올바르지 않습니다."),
    "PAST_TIME_BLOCK": (400, "*이미 지난 시간입니다."),
    "BOOKING_NOT_AVAILABLE": (409, "*예약할 수 없는 시간입니다."),
    "BOOKING_CONFLICT": (409, "*이미 예약된 시간입니다."),
    "RESERVED_BLOCK": (409, "*예약이 있는 시간은 막을 수 없습니다."),
    "ORDER_NOT_FOUND": (404, "*주문을 찾을 수 없습니다."),
    "ORDER_ALREADY_CANCELED": (409, "*이미 취소된 거래입니다."),
    "ORDER_ALREADY_COMPLETED": (409, "*이미 완료된 거래입니다."),
    "ORDER_CANNOT_CANCEL": (409, "*거래 시각이 지나 취소할 수 없습니다."),
    "ORDER_CANNOT_COMPLETE": (409, "*지금은 거래를 확정할 수 없습니다."),
    "CART_ITEM_NOT_FOUND": (404, "*장바구니에 없는 항목입니다."),
    "INVALID_LOCATION": (400, "*선택할 수 없는 거래 장소입니다."),
    "INVALID_QUANTITY": (400, "*수량은 1개 이상이어야 합니다."),
    "CANNOT_ORDER_OWN_PRODUCT": (400, "*내 상품은 예약할 수 없습니다."),
}


def trade_error(code, details=None):
    status, message = _ERRORS[code]
    return AppError(status, code, message, details)


# Firebase 키에 쓸 수 없는 글자. 요청으로 들어온 id를 경로에 넣기 전에 검사한다.
# (예: pid에 "/"가 들어오면 products/abc/def 처럼 엉뚱한 경로를 읽게 됨)
_BAD_KEY_CHARS = set(".#$[]/")


def is_valid_key(value):
    return isinstance(value, str) and value != "" and not (set(value) & _BAD_KEY_CHARS)

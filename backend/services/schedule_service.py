"""
스케줄 (백3): 판매자 거래 가능 시간 + 구매자에게 보이는 예약 가능 칸 계산

DB
  sellerSchedules/{uid}/weekly/{1~7}: ["0700-1100", ...]       (1=월 ... 7=일)
  sellerSchedules/{uid}/exceptions/{yyyyMMdd}/blocked: [...]   (그 날 막은 시간)
  sellerSchedules/{uid}/updatedAt
  sellerBookings/{uid}/{yyyyMMdd_HHmm}: oid                    (예약 장부)

구매자에게 보이는 칸 = weekly − blocked − 지난 시각, 오늘 포함 30일만.
sellerBookings에 있으면 BOOKED. DB에 저장하지 않고 볼 때 계산한다.
"""

from datetime import datetime

from firebase_admin import db

from services.trade_errors import is_valid_key, trade_error
from utils.locks import order_lock
from utils.time_utils import (
    booking_window_ms, date_to_key, key_to_date, merge_ranges, month_dates,
    ms_to_iso, now_ms, parse_month, ranges_to_api, ranges_to_block_times,
    split_trade_key, today_key, trade_key_to_ms,
)

WEEKDAYS = range(1, 8)


# ---------------------------------------------------------------------
# 읽기 도우미 (장바구니·주문 쪽에서도 사용)
# ---------------------------------------------------------------------

def get_active_product(pid):
    """없거나 최종 삭제된 상품이면 404 PRODUCT_NOT_FOUND. 있으면 상품 dict."""
    if not is_valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    product = db.reference(f"products/{pid}").get()
    if not product or product.get("deleted"):
        raise trade_error("PRODUCT_NOT_FOUND")
    return product


def read_weekly(raw):
    """DB의 weekly를 항상 {1: [...], ..., 7: [...]} 모양으로.
    키가 숫자라 Firebase가 dict 대신 list([None, 월, 화, ...])로 줄 수 있어서 두 경우 모두 처리."""
    out = {d: [] for d in WEEKDAYS}
    if isinstance(raw, list):
        for d in WEEKDAYS:
            if d < len(raw) and raw[d]:
                out[d] = list(raw[d])
    elif isinstance(raw, dict):
        for k, v in raw.items():
            if str(k).isdigit() and int(k) in out and v:
                out[int(k)] = list(v.values()) if isinstance(v, dict) else list(v)
    return out


def _as_list(raw):
    """Firebase가 배열을 dict({"0": ..., "1": ...})로 줄 때도 list로"""
    if isinstance(raw, dict):
        return [raw[k] for k in sorted(raw, key=lambda x: int(x))]
    return list(raw or [])


def has_schedule(weekly):
    """weekly가 전부 비었으면 스케줄 없음과 같게 취급"""
    return any(weekly[d] for d in WEEKDAYS)


def get_weekly(uid):
    return read_weekly(db.reference(f"sellerSchedules/{uid}/weekly").get())


def get_blocked(uid, date_key):
    return _as_list(db.reference(f"sellerSchedules/{uid}/exceptions/{date_key}/blocked").get())


def _month_prefix(month):
    return month.replace("-", "")          # '2026-11' -> '202611'


def get_month_exceptions(uid, month):
    """그 달의 막은 날만 {날짜 키: [막은 범위]}. 키가 yyyyMMdd라 키 순서 = 날짜 순서."""
    p = _month_prefix(month)
    raw = (db.reference(f"sellerSchedules/{uid}/exceptions")
             .order_by_key().start_at(f"{p}01").end_at(f"{p}31").get()) or {}
    out = {}
    for date_key, node in raw.items():
        blocked = _as_list((node or {}).get("blocked"))
        if blocked:
            out[date_key] = blocked
    return out


def get_month_bookings(uid, month):
    """그 달에 예약된 tradeKey 집합"""
    p = _month_prefix(month)
    raw = (db.reference(f"sellerBookings/{uid}")
             .order_by_key().start_at(f"{p}01").end_at(f"{p}31_9999").get()) or {}
    return set(raw.keys())


def get_day_bookings(uid, date_key):
    raw = (db.reference(f"sellerBookings/{uid}")
             .order_by_key().start_at(f"{date_key}_0000").end_at(f"{date_key}_9999").get()) or {}
    return set(raw.keys())


def _weekday(date_key):
    return datetime.strptime(date_key, "%Y%m%d").isoweekday()   # 1=월 ... 7=일


def _in_ranges(hhmm, db_ranges):
    """'1430'이 ['0700-1100', ...] 중 하나에 들어가는지 (끝 시각 제외). 4자리 문자열이라 글자 비교 = 시간 비교"""
    for r in db_ranges or []:
        start, end = r.split("-")
        if start <= hhmm < end:
            return True
    return False


# ---------------------------------------------------------------------
# 칸 계산 (공용)
# ---------------------------------------------------------------------

def day_blocks(weekly, blocked, booked, date_key, now):
    """그 날 구매자에게 보여줄 칸 목록. (주간 − 막은 시간 − 지난 시각), 예약된 칸은 BOOKED.
    예약 가능 기간(30일) 검사는 부르는 쪽에서."""
    open_times = set(ranges_to_block_times(weekly[_weekday(date_key)]))
    open_times -= set(ranges_to_block_times(blocked))
    blocks = []
    for hhmm in sorted(open_times):
        trade_key = f"{date_key}_{hhmm}"
        if trade_key_to_ms(trade_key) <= now:
            continue
        blocks.append({
            "tradeKey": trade_key,
            "startTime": f"{hhmm[:2]}:{hhmm[2:]}",
            "state": "BOOKED" if trade_key in booked else "OPEN",
        })
    return blocks


def block_problem(seller_id, trade_key, now):
    """구매자가 이 칸을 예약할 수 있는지. 되면 None, 안 되면 에러 코드 문자열.
    (장바구니 담기·변경·조회, 예약 생성에서 같은 규칙으로 사용)
      PAST_TIME_BLOCK       : 지난 시각
      BOOKING_NOT_AVAILABLE : 30일 밖, 스케줄 없음, 판매자가 안 열었거나 막은 칸
      BOOKING_CONFLICT      : 이미 예약된 칸
    tradeKey 형식은 부르는 쪽에서 미리 검사(parse_trade_key)해야 한다."""
    start = trade_key_to_ms(trade_key)
    if start <= now:
        return "PAST_TIME_BLOCK"
    window_start, window_end = booking_window_ms()
    if not (window_start <= start < window_end):
        return "BOOKING_NOT_AVAILABLE"

    date_key, hhmm = split_trade_key(trade_key)
    weekly = get_weekly(seller_id)
    if not _in_ranges(hhmm, weekly[_weekday(date_key)]):
        return "BOOKING_NOT_AVAILABLE"
    if _in_ranges(hhmm, get_blocked(seller_id, date_key)):
        return "BOOKING_NOT_AVAILABLE"
    if db.reference(f"sellerBookings/{seller_id}/{trade_key}").get():
        return "BOOKING_CONFLICT"
    return None


# ---------------------------------------------------------------------
# 내 거래 시간 조회  GET /schedules/me?month=YYYY-MM
# ---------------------------------------------------------------------

def _weekly_to_api(weekly):
    return {str(d): ranges_to_api(weekly[d]) for d in WEEKDAYS}


def get_my_schedule(uid, month):
    try:
        month = parse_month(month)
    except ValueError:
        raise trade_error("INVALID_TIME_RANGE")

    weekly = get_weekly(uid)
    exceptions = get_month_exceptions(uid, month)
    updated_at = db.reference(f"sellerSchedules/{uid}/updatedAt").get()

    return {
        "month": month,
        "weekly": _weekly_to_api(weekly),
        "exceptions": [
            {"date": key_to_date(k), "blocked": ranges_to_api(v)}
            for k, v in sorted(exceptions.items())
        ],
        "booked": sorted(get_month_bookings(uid, month)),
        "updatedAt": ms_to_iso(updated_at),
    }


# ---------------------------------------------------------------------
# 주간 시간 저장  PUT /schedules/me/weekly
# ---------------------------------------------------------------------

def save_weekly(uid, weekly_body):
    if not isinstance(weekly_body, dict):
        raise trade_error("MISSING_REQUIRED_FIELD")

    weekly = {d: [] for d in WEEKDAYS}
    try:
        for k, ranges in weekly_body.items():
            if not (str(k).isdigit() and int(k) in weekly) or not isinstance(ranges, list):
                raise ValueError(f"요일 키나 값이 틀림: {k}")
            weekly[int(k)] = merge_ranges(ranges)       # 겹치거나 맞닿으면 병합
    except (ValueError, TypeError, AttributeError):
        raise trade_error("INVALID_TIME_RANGE")

    # 빈 요일은 Firebase에 안 남으므로 아예 빼고 저장. 전부 비면 weekly 노드 삭제(None)
    stored = {str(d): weekly[d] for d in WEEKDAYS if weekly[d]} or None
    updated_at = now_ms()
    db.reference().update({
        f"sellerSchedules/{uid}/weekly": stored,
        f"sellerSchedules/{uid}/updatedAt": updated_at,
    })
    # 주간 시간을 줄여도 이미 잡힌 예약(sellerBookings)은 그대로 유효
    return {"weekly": _weekly_to_api(weekly), "updatedAt": ms_to_iso(updated_at)}


# ---------------------------------------------------------------------
# 특정 날 시간 막기·풀기  PUT /schedules/me/exceptions/{date}
# ---------------------------------------------------------------------

def save_exception(uid, date, blocked_body):
    try:
        date_key = date_to_key(date)
    except ValueError:
        raise trade_error("INVALID_TIME_RANGE")
    if not isinstance(blocked_body, list):
        raise trade_error("MISSING_REQUIRED_FIELD")
    try:
        new_blocked = merge_ranges(blocked_body)
    except (ValueError, TypeError, AttributeError):
        raise trade_error("INVALID_TIME_RANGE")

    if date_key < today_key():
        raise trade_error("PAST_TIME_BLOCK")

    path = f"sellerSchedules/{uid}/exceptions/{date_key}"

    # 전부 풀기: 노드 삭제, RESERVED_BLOCK 검사 없음
    if not new_blocked:
        db.reference().update({path: None, f"sellerSchedules/{uid}/updatedAt": now_ms()})
        return {"date": date, "blocked": []}

    # 구매자가 같은 순간 그 칸을 예약할 수 있으므로 검사 + 저장을 order_lock 안에서
    with order_lock:
        now = now_ms()
        old_times = set(ranges_to_block_times(get_blocked(uid, date_key)))
        added = set(ranges_to_block_times(new_blocked)) - old_times   # 새로 막는 칸만

        # 오늘: 원래 막혀 있던 범위는 지났어도 통과, 새로 막는 칸만 지난 시각 검사
        if any(trade_key_to_ms(f"{date_key}_{t}") <= now for t in added):
            raise trade_error("PAST_TIME_BLOCK")

        booked = get_day_bookings(uid, date_key)
        reserved = sorted(f"{date_key}_{t}" for t in added if f"{date_key}_{t}" in booked)
        if reserved:
            raise trade_error("RESERVED_BLOCK", {"tradeKeys": reserved})

        db.reference().update({
            f"{path}/blocked": new_blocked,
            f"sellerSchedules/{uid}/updatedAt": now,
        })

    return {"date": date, "blocked": ranges_to_api(new_blocked)}


# ---------------------------------------------------------------------
# 예약 가능 시간 조회  GET /products/{pid}/available-blocks?date=
# ---------------------------------------------------------------------

def get_available_blocks(pid, date):
    if not date:
        raise trade_error("MISSING_REQUIRED_FIELD")
    try:
        date_key = date_to_key(date)
    except ValueError:
        raise trade_error("INVALID_TIME_RANGE")

    product = get_active_product(pid)

    if date_key < today_key():
        raise trade_error("PAST_TIME_BLOCK")
    window_start, window_end = booking_window_ms()
    if trade_key_to_ms(f"{date_key}_0000") >= window_end:   # 오늘+29일 이후
        raise trade_error("INVALID_TIME_RANGE")

    seller_id = product["sellerId"]
    weekly = get_weekly(seller_id)
    if not has_schedule(weekly):
        raise trade_error("SCHEDULE_NOT_FOUND")

    blocks = day_blocks(weekly, get_blocked(seller_id, date_key),
                        get_day_bookings(seller_id, date_key), date_key, now_ms())
    return {"date": date, "blocks": blocks}


# ---------------------------------------------------------------------
# 예약 가능 날짜 조회  GET /products/{pid}/available-dates?month=
# ---------------------------------------------------------------------

def get_available_dates(pid, month):
    try:
        month = parse_month(month)
    except ValueError:
        raise trade_error("INVALID_TIME_RANGE")

    product = get_active_product(pid)
    seller_id = product["sellerId"]
    weekly = get_weekly(seller_id)
    if not has_schedule(weekly):
        raise trade_error("SCHEDULE_NOT_FOUND")

    # 그 달 막은 날·예약을 한 번씩만 읽고 날짜별 계산은 day_blocks()로
    exceptions = get_month_exceptions(seller_id, month)
    booked = get_month_bookings(seller_id, month)
    now = now_ms()
    window_start, window_end = booking_window_ms()

    dates = []
    for date in month_dates(month):
        date_key = date_to_key(date)
        day_start = trade_key_to_ms(f"{date_key}_0000")
        has_open = False
        if window_start <= day_start < window_end:
            blocks = day_blocks(weekly, exceptions.get(date_key), booked, date_key, now)
            has_open = any(b["state"] == "OPEN" for b in blocks)
        dates.append({"date": date, "hasOpenBlock": has_open})

    return {"month": month, "dates": dates}

import re
import time
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
DAY_MS = 24 * 60 * 60 * 1000
BLOCK_MINUTES = 30
_MINUTE_MS = 60_000
_BLOCK_MS = BLOCK_MINUTES * _MINUTE_MS


# ---------------------------------------------------------------------
# 지금 시각
# ---------------------------------------------------------------------

def now_ms():
    """지금 시각, 1794800000000같은거 (epoch ms). DB에 createdAt 등을 쓸 때 사용."""
    return int(time.time() * 1000)


def today_date():
    """오늘 날짜 'YYYY-MM-DD' (한국 시간)"""
    return datetime.now(KST).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------
# epoch ms <-> ISO 8601  (DB 값 <-> API 값)
# ---------------------------------------------------------------------

def ms_to_iso(ms):
    """1794805200000 -> '2026-11-16T14:00:00+09:00'. None이면 None (응답에 null로 나가게)."""
    if ms is None:
        return None #"""canceledAt같이 아직없는 값은 None으로 나감"""
    return datetime.fromtimestamp(ms / 1000, KST).isoformat(timespec="seconds")


def iso_to_ms(iso):
    """'2026-11-16T14:00:00+09:00' -> 1794805200000. 시간대가 없으면 한국 시간으로 본다."""
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    return int(dt.timestamp() * 1000)


# ---------------------------------------------------------------------
# 날짜: API 'YYYY-MM-DD' <-> DB 키 'YYYYMMDD'
# ---------------------------------------------------------------------

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATE_KEY_RE = re.compile(r"^\d{8}$")
_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def parse_date(date_str):
    """'2026-11-16' 형식·실제 날짜 검사 (2026-02-30 같은 것도 거름). 틀리면 ValueError."""
    if not isinstance(date_str, str) or not _DATE_RE.match(date_str):
        raise ValueError(f"날짜 형식 틀림: {date_str}")
    datetime.strptime(date_str, "%Y-%m-%d")
    return date_str


def date_to_key(date_str):
    """'2026-11-16' -> '20261116' (DB에 저장할 때, DB경로용임)"""
    return parse_date(date_str).replace("-", "")


def key_to_date(date_key):
    """'20261116' -> '2026-11-16' (응답 만들 때, 서버응답용)"""
    if not _DATE_KEY_RE.match(date_key or ""):
        raise ValueError(f"날짜 키 형식 틀림: {date_key}")
    return f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}"


def date_start_ms(date_str):
    """'2026-11-16' -> 그 날 00:00(한국 시간)의 epoch ms"""
    dt = datetime.strptime(parse_date(date_str), "%Y-%m-%d").replace(tzinfo=KST)
    return int(dt.timestamp() * 1000)


def ms_to_date(ms):
    """epoch ms -> 'YYYY-MM-DD' (한국 시간 기준 날짜)"""
    return datetime.fromtimestamp(ms / 1000, KST).strftime("%Y-%m-%d")


def ms_to_date_key(ms):
    """epoch ms -> 'YYYYMMDD'. rankingDaily/{날짜 키} 처럼 '오늘 날짜 키'가 필요할 때."""
    return datetime.fromtimestamp(ms / 1000, KST).strftime("%Y%m%d")


def today_key():
    return ms_to_date_key(now_ms())


def booking_window_ms():
    """한국 시간 기준 오늘 포함 30일. 반환한 끝 시각은 예약 기간에서 제외한다."""
    start_ms = date_start_ms(today_date())
    return start_ms, start_ms + 30 * DAY_MS


# ---------------------------------------------------------------------
# 달: 'YYYY-MM'
# ---------------------------------------------------------------------

def parse_month(month_str):
    """'2026-11' 검사. 틀리면 ValueError. None이면 이번 달."""
    if month_str is None:
        return datetime.now(KST).strftime("%Y-%m")
    if not isinstance(month_str, str) or not _MONTH_RE.match(month_str):
        raise ValueError(f"달 형식 틀림: {month_str}")
    datetime.strptime(month_str, "%Y-%m")
    return month_str


def month_range_ms(month_str):
    """'2026-11' -> (11/1 00:00 ms, 12/1 00:00 ms). 범위 조회는 start <= t < end."""
    m = parse_month(month_str)
    start = datetime.strptime(m, "%Y-%m").replace(tzinfo=KST)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def month_dates(month_str):
    """'2026-11' -> ['2026-11-01', ..., '2026-11-30'] (예약 가능 날짜 조회용)"""
    start, end = month_range_ms(month_str)
    out, t = [], start
    while t < end:
        out.append(ms_to_date(t))
        t += DAY_MS
    return out


# ---------------------------------------------------------------------
# tradeKey: 'YYYYMMDD_HHmm'
# ---------------------------------------------------------------------

_TRADE_KEY_RE = re.compile(r"^\d{8}_\d{4}$")


def parse_trade_key(trade_key):
    """형식 + 실제 시각 + 30분 단위 검사. 틀리면 ValueError (→ 400 INVALID_TIME_RANGE)."""
    if not isinstance(trade_key, str) or not _TRADE_KEY_RE.match(trade_key):
        raise ValueError(f"tradeKey 형식 틀림: {trade_key}")
    dt = datetime.strptime(trade_key, "%Y%m%d_%H%M")
    if dt.minute % BLOCK_MINUTES != 0:
        raise ValueError(f"30분 단위가 아님: {trade_key}")
    return trade_key


def trade_key_to_ms(trade_key):
    """'20261116_1400' -> 1794805200000 (한국 시간). DB의 tradeStartAt 값."""
    dt = datetime.strptime(parse_trade_key(trade_key), "%Y%m%d_%H%M").replace(tzinfo=KST)
    return int(dt.timestamp() * 1000)


def trade_key_to_iso(trade_key):
    """'20261116_1400' -> '2026-11-16T14:00:00+09:00'"""
    return ms_to_iso(trade_key_to_ms(trade_key))


def ms_to_trade_key(ms):
    """epoch ms -> 'YYYYMMDD_HHmm'"""
    return datetime.fromtimestamp(ms / 1000, KST).strftime("%Y%m%d_%H%M")


def split_trade_key(trade_key):
    """'20261116_1400' -> ('20261116', '1400'). 스케줄 검사할 때 날짜 키·시각을 꺼내는 용도."""
    parse_trade_key(trade_key)
    return trade_key[:8], trade_key[9:]


def trade_key_start_time(trade_key):
    """'20261116_1400' -> '14:00' (available-blocks 응답의 startTime)"""
    _, hhmm = split_trade_key(trade_key)
    return f"{hhmm[:2]}:{hhmm[2:]}"


def make_trade_key(date_str, hhmm):
    """('2026-11-16', '1400') -> '20261116_1400'"""
    return parse_trade_key(f"{date_to_key(date_str)}_{hhmm}")


# ---------------------------------------------------------------------
# 시간 범위: DB '0700-1100' <-> API {"start": "07:00", "end": "11:00"}
# ---------------------------------------------------------------------

_HHMM_RE = re.compile(r"[0-9]{2}:[0-9]{2}")
_DB_RANGE_RE = re.compile(r"[0-9]{4}-[0-9]{4}")


def _hhmm_to_ms(hhmm_colon):
    if not isinstance(hhmm_colon, str) or not _HHMM_RE.fullmatch(hhmm_colon):
        raise ValueError(f"시각 형식 틀림: {hhmm_colon}")
    h, m = int(hhmm_colon[:2]), int(hhmm_colon[3:])
    if not (0 <= h <= 24 and 0 <= m < 60) or (h == 24 and m != 0):
        raise ValueError(f"없는 시각: {hhmm_colon}")
    return (h * 60 + m) * _MINUTE_MS


def _range_bounds_ms(r):
    if not isinstance(r, dict):
        raise ValueError(f"시간 범위는 start, end 객체여야 함: {r}")
    start_ms, end_ms = _hhmm_to_ms(r.get("start")), _hhmm_to_ms(r.get("end"))
    if start_ms % _BLOCK_MS or end_ms % _BLOCK_MS:
        raise ValueError(f"30분 단위가 아님: {r}")
    if start_ms >= end_ms:
        raise ValueError(f"시작 >= 끝: {r}")
    return start_ms, end_ms


def _db_range_bounds_ms(db_range):
    if not isinstance(db_range, str) or not _DB_RANGE_RE.fullmatch(db_range):
        raise ValueError(f"DB 시간 범위 형식 틀림: {db_range}")
    start, end = db_range.split("-")
    return _range_bounds_ms({"start": f"{start[:2]}:{start[2:]}", "end": f"{end[:2]}:{end[2:]}"})


def _format_hhmm(ms, separator=""):
    hour, minute = divmod(ms // _MINUTE_MS, 60)
    return f"{hour:02d}{separator}{minute:02d}"


def _format_db_range(start_ms, end_ms):
    return f"{_format_hhmm(start_ms)}-{_format_hhmm(end_ms)}"


def range_to_db(r):
    """{"start": "07:00", "end": "11:00"} -> '0700-1100'.
    30분 단위, 시작 < 끝 검사. 하루 전체는 {"start": "00:00", "end": "24:00"}."""
    return _format_db_range(*_range_bounds_ms(r))


def range_to_api(db_range):
    """'0700-1100' -> {"start": "07:00", "end": "11:00"}"""
    start_ms, end_ms = _db_range_bounds_ms(db_range)
    return {"start": _format_hhmm(start_ms, ":"), "end": _format_hhmm(end_ms, ":")}


def ranges_to_db(ranges):
    """API 범위 목록 -> DB 문자열 목록. 시작 시각 순으로 정렬하고, 겹치면 ValueError."""
    out = sorted(_range_bounds_ms(r) for r in (ranges or []))
    for prev, cur in zip(out, out[1:]):
        if cur[0] < prev[1]:
            raise ValueError(f"범위 겹침: {prev}, {cur}")
    return [_format_db_range(start_ms, end_ms) for start_ms, end_ms in out]


def ranges_to_api(db_ranges):
    """DB 문자열 목록 -> API 범위 목록"""
    return [range_to_api(r) for r in (db_ranges or [])]


def merge_ranges(ranges):
    """겹치거나 맞닿은 API 시간 범위를 병합해 DB 저장 형식으로 반환한다."""
    if not isinstance(ranges, list):
        raise ValueError("시간 범위는 배열이어야 함")
    merged = []
    for start_ms, end_ms in sorted(_range_bounds_ms(item) for item in ranges):
        if merged and start_ms <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end_ms)
        else:
            merged.append([start_ms, end_ms])
    return [_format_db_range(start_ms, end_ms) for start_ms, end_ms in merged]


def ranges_to_block_times(ranges):
    """DB 시간 범위를 끝 시각을 제외한 30분 시작 시각(HHmm) 목록으로 바꾼다."""
    blocks = []
    for db_range in ranges or []:
        start_ms, end_ms = _db_range_bounds_ms(db_range)
        blocks.extend(_format_hhmm(ms) for ms in range(start_ms, end_ms, _BLOCK_MS))
    return blocks

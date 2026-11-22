"""
주문 (백3): 예약 생성 / 거래 내역 / 확인서 / 취소 / 거래 확정 / 실패 처리

동시성
- 재고, 상품 status, activeOrderCount, pendingDelete, sellerBookings, 주문 status를 바꾸는 함수는
  전부 utils.locks.order_lock 안에서 "전부 검사 → multi-path update 1번" 순서로 처리한다.
  검사 중 실패하면 아직 아무것도 안 썼으므로 되돌릴 것이 없다 (= 전부 성공 or 전부 실패).
- threading.Lock은 재진입 불가 → order_lock 안에서 fail_if_overdue() 같은 lock 잡는 함수를 부르지 않는다.

주문 status(DB)와 displayStatus(화면)는 다르다
  CONFIRMED  && now < 거래 시각            → UPCOMING (예정)
  CONFIRMED  && 거래 시각 <= now < +24시간   → AWAITING_CONFIRM (확정 대기)
  CONFIRMED  && now >= 거래 시각 + 24시간    → 볼 때 FAILED로 바꾸고 재고 복구 (fail_if_overdue)
  COMPLETED / CANCELED / FAILED            → 그대로
"""

from collections import Counter

from firebase_admin import db

from services.product_rules import ON_SALE, TEMP_SOLD_OUT, delete_updates, status_after_stock
from services.schedule_service import block_problem
from services.trade_errors import is_valid_key, trade_error
from utils.locks import order_lock
from utils.time_utils import (
    DAY_MS, ms_to_iso, month_range_ms, now_ms, parse_month, parse_trade_key,
    today_key, trade_key_to_ms,
)

FAIL_AFTER_MS = DAY_MS          # 거래 시각 + 24시간 동안 확정이 없으면 실패
RANKING_SCORE_PER_SALE = 3      # 판매 완료 1건 = 3점 (찜 1개 = 1점)
ROLES = ("buying", "selling")


# ---------------------------------------------------------------------
# 공용 도우미
# ---------------------------------------------------------------------

def _get_order(oid):
    if not is_valid_key(oid):
        return None
    o = db.reference(f"orders/{oid}").get()
    if o is not None:
        o["oid"] = oid
    return o


def _get_product(pid):
    if not is_valid_key(pid):
        return None
    return db.reference(f"products/{pid}").get()


def product_problem(product, buyer_uid):
    """상품 상태만 보고 예약할 수 없는 이유 (장바구니·예약 공용). 되면 None.
    상품이 없거나 삭제된 경우(PRODUCT_NOT_FOUND)는 부르는 쪽에서 먼저 확인."""
    if product.get("sellerId") == buyer_uid:
        return "CANNOT_ORDER_OWN_PRODUCT"
    status = product.get("status")
    if product.get("pendingDelete") or status not in (ON_SALE, TEMP_SOLD_OUT):
        return "PRODUCT_NOT_AVAILABLE"
    if status == TEMP_SOLD_OUT:                 # 일시품절 = 재고 0
        return "OUT_OF_STOCK"
    return None


def location_text(product, location_id):
    """products/{pid}/locations/{locationId}의 지금 문구. 없는 장소면 None"""
    if not is_valid_key(location_id):
        return None
    return (product.get("locations") or {}).get(location_id)


def display_status(o, now):
    status = o.get("status")
    if status != "CONFIRMED":
        return status                       # COMPLETED / CANCELED / FAILED
    start = o["tradeStartAt"]
    if now < start:
        return "UPCOMING"
    if now < start + FAIL_AFTER_MS:
        return "AWAITING_CONFIRM"
    return "FAILED"                          # 아직 안 바뀐 기한 지난 주문 (보통은 fail_if_overdue가 먼저 바꿈)


def _merge_updates(updates, extra):
    """multi-path update는 한 경로가 다른 경로의 상위이면 거부된다.
    extra(최종 삭제 경로 등)와 겹치는 기존 경로를 지우고 합친다. 같은 경로면 extra 값이 이김."""
    for path in extra:
        for existing in list(updates):
            if existing.startswith(path + "/") or path.startswith(existing + "/"):
                del updates[existing]
    updates.update(extra)


def _restore_stock_updates(o, product, updates):
    """취소·실패 시 재고 복구 + 상품 status 다시 계산 (ENDED는 유지)"""
    pid = o["pid"]
    new_stock = (product.get("stock") or 0) + (o.get("quantity") or 0)
    updates[f"products/{pid}/stock"] = new_stock
    updates[f"products/{pid}/status"] = status_after_stock(product.get("status"), new_stock)


def _close_active_updates(o, product, updates):
    """CONFIRMED 주문이 끝날 때(확정·취소·실패) activeOrderCount − 1.
    0이 되고 삭제 요청(pendingDelete) 상태면 같은 update에서 최종 삭제."""
    pid = o["pid"]
    count = max((product.get("activeOrderCount") or 0) - 1, 0)
    updates[f"products/{pid}/activeOrderCount"] = count
    if count == 0 and product.get("pendingDelete"):
        _merge_updates(updates, delete_updates(pid))


def _fail_updates(o, product, now):
    oid = o["oid"]
    updates = {
        f"orders/{oid}/status": "FAILED",
        f"orders/{oid}/failedAt": now,
    }
    _restore_stock_updates(o, product, updates)
    _close_active_updates(o, product, updates)
    return updates


def _is_overdue(o, now):
    return bool(o) and o.get("status") == "CONFIRMED" and now >= o["tradeStartAt"] + FAIL_AFTER_MS


# ---------------------------------------------------------------------
# 실패 처리 (볼 때 계산)
# ---------------------------------------------------------------------

def fail_if_overdue(oid):
    """주문을 보여주기 전에 호출. 기한이 지났으면 FAILED로 바꾸고 재고 복구 (1번만).
    갱신된 주문 dict(oid 포함)를 돌려준다. 없는 주문이면 None.
    ※ order_lock 안에서 부르면 안 됨 (안에서 lock을 잡음)"""
    o = _get_order(oid)
    if not _is_overdue(o, now_ms()):          # 대부분 여기서 끝 → lock 안 잡아서 빠름
        return o

    with order_lock:
        # lock을 기다리는 동안 다른 요청이 이미 바꿨을 수 있으니 다시 확인
        o = _get_order(oid)
        now = now_ms()
        if not _is_overdue(o, now):
            return o
        product = _get_product(o["pid"]) or {}
        db.reference().update(_fail_updates(o, product, now))
        o["status"] = "FAILED"
        o["failedAt"] = now
        return o


def fail_overdue_for_seller(seller_id):
    """[백2 상품 상세에서 호출] 그 판매자의 기한 지난 판매 주문을 실패 처리 → 재고가 맞게 보임.
    ※ order_lock 안에서 부르면 안 됨"""
    cutoff = now_ms() - FAIL_AFTER_MS
    old = (db.reference(f"userOrders/{seller_id}/selling")
             .order_by_value().end_at(cutoff).get()) or {}
    for oid in old:
        fail_if_overdue(oid)


# ---------------------------------------------------------------------
# 예약 생성  POST /orders  (바로 구매·장바구니 일괄)
# ---------------------------------------------------------------------

def _item_details(index, item):
    details = {"index": index}
    if item.get("cartKey"):
        details["cartKey"] = item["cartKey"]
    return details


def parse_quantity(value):
    """수량 검사. bool·소수·문자는 거부. 1 미만이면 INVALID_QUANTITY"""
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return None
    return value


def _validate_items_format(items):
    """lock 밖에서 할 수 있는 형식 검사 (DB 안 읽음)"""
    if not isinstance(items, list) or not items:
        raise trade_error("MISSING_REQUIRED_FIELD")
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise trade_error("MISSING_REQUIRED_FIELD", {"index": i})
        d = _item_details(i, it)
        if any(it.get(k) in (None, "") for k in ("pid", "tradeKey", "locationId", "quantity")):
            raise trade_error("MISSING_REQUIRED_FIELD", d)
        if parse_quantity(it["quantity"]) is None:
            raise trade_error("INVALID_QUANTITY", d)
        try:
            parse_trade_key(it["tradeKey"])
        except ValueError:
            raise trade_error("INVALID_TIME_RANGE", d)


def reserve(buyer_id, items):
    """전부 성공 or 전부 실패. 성공하면 [{oid, status, tradeStartAt}, ...]"""
    _validate_items_format(items)

    # 기한 지난 주문이 재고를 붙잡고 있으면 재고가 적게 보이므로 먼저 정리 (lock 밖에서!)
    sellers = set()
    for it in items:
        p = _get_product(it["pid"])
        if p and p.get("sellerId"):
            sellers.add(p["sellerId"])
    for seller_id in sellers:
        fail_overdue_for_seller(seller_id)

    with order_lock:
        now = now_ms()

        # ---------- 1단계: 읽기 + 검사 (아직 아무것도 쓰지 않음) ----------
        products = {}
        slots = {}                 # (sellerId, tradeKey) -> 처음 나온 index
        need = Counter()           # pid -> 요청 수량 합계
        first_index = {}           # pid -> 그 상품이 처음 나온 index

        for i, it in enumerate(items):
            d = _item_details(i, it)
            pid = it["pid"]
            if pid not in products:
                products[pid] = _get_product(pid)
            p = products[pid]
            if not p or p.get("deleted"):
                raise trade_error("PRODUCT_NOT_FOUND", d)

            problem = product_problem(p, buyer_id)
            if problem:
                raise trade_error(problem, d)
            if location_text(p, it["locationId"]) is None:
                raise trade_error("INVALID_LOCATION", d)

            cart_key = it.get("cartKey")
            if cart_key is not None:
                if not is_valid_key(cart_key) or not db.reference(f"carts/{buyer_id}/{cart_key}").get():
                    raise trade_error("CART_ITEM_NOT_FOUND", d)

            problem = block_problem(p["sellerId"], it["tradeKey"], now)
            if problem == "BOOKING_CONFLICT":
                raise trade_error(problem, {**d, "reason": "ALREADY_BOOKED"})
            if problem:
                raise trade_error(problem, d)

            slot = (p["sellerId"], it["tradeKey"])
            if slot in slots:        # 한 번에 고른 항목끼리 같은 판매자·같은 시간
                raise trade_error("BOOKING_CONFLICT",
                                  {**d, "reason": "DUPLICATE_IN_REQUEST", "conflictWith": slots[slot]})
            slots[slot] = i

            need[pid] += it["quantity"]          # 같은 상품이 여러 줄이면 합쳐서 검사
            first_index.setdefault(pid, i)

        for pid, qty in need.items():
            if (products[pid].get("stock") or 0) < qty:
                i = first_index[pid]
                raise trade_error("OUT_OF_STOCK", _item_details(i, items[i]))

        buyer_nickname = db.reference(f"users/{buyer_id}/nickname").get()

        # ---------- 2단계: 한 번에 쓰기 ----------
        updates = {}
        created = []
        for it in items:
            p = products[it["pid"]]
            seller_id = p["sellerId"]
            oid = db.reference("orders").push().key       # 키만 받음 (DB에 안 씀)
            start = trade_key_to_ms(it["tradeKey"])
            qty = it["quantity"]

            updates[f"orders/{oid}"] = {                  # 스냅샷
                "pid": it["pid"],
                "productName": p.get("name"),
                "thumbnail": (p.get("images") or [None])[0],
                "quantity": qty,
                "unitPrice": p.get("price"),
                "totalPrice": (p.get("price") or 0) * qty,
                "sellerId": seller_id,
                "buyerId": buyer_id,
                "sellerNickname": db.reference(f"users/{seller_id}/nickname").get() or p.get("sellerNickname"),
                "buyerNickname": buyer_nickname,
                "tradeKey": it["tradeKey"],
                "tradeStartAt": start,
                "locationId": it["locationId"],
                "location": location_text(p, it["locationId"]),
                "status": "CONFIRMED",
                "createdAt": now,
            }
            updates[f"sellerBookings/{seller_id}/{it['tradeKey']}"] = oid
            updates[f"userOrders/{buyer_id}/buying/{oid}"] = start
            updates[f"userOrders/{seller_id}/selling/{oid}"] = start
            updates[f"users/{seller_id}/lastOrderAt"] = now    # 판매자 메뉴 ! 표시용 (판매자만)
            if it.get("cartKey"):
                updates[f"carts/{buyer_id}/{it['cartKey']}"] = None
            created.append({"oid": oid, "status": "CONFIRMED", "tradeStartAt": ms_to_iso(start)})

        order_count = Counter(it["pid"] for it in items)
        for pid, qty in need.items():
            p = products[pid]
            left = p["stock"] - qty
            updates[f"products/{pid}/stock"] = left
            updates[f"products/{pid}/status"] = status_after_stock(p.get("status"), left)
            updates[f"products/{pid}/activeOrderCount"] = (p.get("activeOrderCount") or 0) + order_count[pid]

        db.reference().update(updates)      # 여러 경로를 한 요청으로 → 전부 반영 or 전부 실패

    return created


# ---------------------------------------------------------------------
# 거래 취소  PATCH /orders/{oid}/cancel
# ---------------------------------------------------------------------

def _get_my_order_locked(oid, uid):
    o = _get_order(oid)
    if not o:
        raise trade_error("ORDER_NOT_FOUND")
    if uid not in (o.get("buyerId"), o.get("sellerId")):
        raise trade_error("FORBIDDEN")
    return o


def _raise_if_finished(o, cannot_code):
    status = o.get("status")
    if status == "CANCELED":
        raise trade_error("ORDER_ALREADY_CANCELED")
    if status == "COMPLETED":
        raise trade_error("ORDER_ALREADY_COMPLETED")
    if status == "FAILED":
        raise trade_error(cannot_code)


def cancel_order(oid, uid):
    with order_lock:
        o = _get_my_order_locked(oid, uid)
        _raise_if_finished(o, "ORDER_CANNOT_CANCEL")

        now = now_ms()
        product = _get_product(o["pid"]) or {}
        if now >= o["tradeStartAt"]:
            if _is_overdue(o, now):                 # 보는 김에 실패 처리
                db.reference().update(_fail_updates(o, product, now))
            raise trade_error("ORDER_CANNOT_CANCEL")

        updates = {
            f"orders/{oid}/status": "CANCELED",
            f"orders/{oid}/canceledBy": uid,
            f"orders/{oid}/canceledAt": now,
            f"sellerBookings/{o['sellerId']}/{o['tradeKey']}": None,    # 그 칸 다시 열림
        }
        _restore_stock_updates(o, product, updates)
        _close_active_updates(o, product, updates)
        db.reference().update(updates)

    return {"oid": oid, "status": "CANCELED", "canceledAt": ms_to_iso(now)}


# ---------------------------------------------------------------------
# 거래 확정  PATCH /orders/{oid}/complete  (둘 중 먼저 누른 사람)
# ---------------------------------------------------------------------

def complete_order(oid, uid):
    with order_lock:
        o = _get_my_order_locked(oid, uid)
        # 구매자·판매자가 동시에 눌러도 lock 덕분에 두 번째 사람은 여기서 ORDER_ALREADY_COMPLETED
        _raise_if_finished(o, "ORDER_CANNOT_COMPLETE")

        now = now_ms()
        pid, seller_id = o["pid"], o["sellerId"]
        product = _get_product(pid) or {}
        if now < o["tradeStartAt"]:
            raise trade_error("ORDER_CANNOT_COMPLETE")
        if _is_overdue(o, now):
            db.reference().update(_fail_updates(o, product, now))
            raise trade_error("ORDER_CANNOT_COMPLETE")

        seller_sold = db.reference(f"users/{seller_id}/soldCount").get() or 0
        day = today_key()                             # 확정이 "일어난 날" (거래 날짜 아님)
        score = db.reference(f"rankingDaily/{day}/products/{pid}").get() or 0

        updates = {
            f"orders/{oid}/status": "COMPLETED",
            f"orders/{oid}/confirmedBy": uid,
            f"orders/{oid}/confirmedAt": now,
            f"users/{seller_id}/soldCount": seller_sold + 1,                  # 건수 기준
            f"products/{pid}/soldCount": (product.get("soldCount") or 0) + 1,
            f"rankingDaily/{day}/products/{pid}": score + RANKING_SCORE_PER_SALE,
        }
        _close_active_updates(o, product, updates)
        db.reference().update(updates)

    return {"oid": oid, "status": "COMPLETED", "confirmedAt": ms_to_iso(now)}


# ---------------------------------------------------------------------
# 거래 내역 · 나의 거래 일정  GET /orders
# ---------------------------------------------------------------------

def _summary(o, uid, now):
    """OrderSummary"""
    role = "buying" if o.get("buyerId") == uid else "selling"
    if role == "buying":
        counterpart = {"uid": o.get("sellerId"), "nickname": o.get("sellerNickname")}
    else:
        counterpart = {"uid": o.get("buyerId"), "nickname": o.get("buyerNickname")}
    review_id = o.get("reviewId")
    return {
        "oid": o["oid"],
        "pid": o.get("pid"),
        "productName": o.get("productName"),
        "thumbnail": o.get("thumbnail"),
        "quantity": o.get("quantity"),
        "totalPrice": o.get("totalPrice"),
        "tradeKey": o.get("tradeKey"),
        "tradeStartAt": ms_to_iso(o.get("tradeStartAt")),
        "location": o.get("location"),
        "role": role,
        "counterpart": counterpart,
        "status": o.get("status"),
        "displayStatus": display_status(o, now),
        "hasReview": review_id is not None,
        "reviewId": review_id,
    }


def count_upcoming(uid):
    """예정 거래 수 (구매+판매, 지금 기준 CONFIRMED && 거래 시각 전) → "나의 거래 일정 N" """
    now = now_ms()
    count = 0
    for role in ROLES:
        future = (db.reference(f"userOrders/{uid}/{role}")
                    .order_by_value().start_at(now + 1).get()) or {}
        for oid in future:
            if db.reference(f"orders/{oid}/status").get() == "CONFIRMED":
                count += 1
    return count


def _parse_cursor(cursor):
    """'1794805200000_order123' -> (1794805200000, 'order123'). 프론트는 그대로 돌려보내기만 함"""
    try:
        ms, oid = cursor.split("_", 1)
        return int(ms), oid
    except (ValueError, AttributeError):
        raise trade_error("INVALID_TIME_RANGE")


def _page_rows(uid, role, cursor, need):
    """userOrders/{uid}/{role}에서 cursor보다 앞(더 과거)인 항목을 최신순으로 need개까지.
    Firebase엔 OFFSET이 없어서 "마지막으로 본 항목 다음부터" 방식.
    같은 거래 시각이 여러 개면 oid로 순서를 정하고, 이미 보낸 것을 빼느라 모자라면 더 읽는다."""
    fetch = need
    while True:
        query = db.reference(f"userOrders/{uid}/{role}").order_by_value()
        if cursor:
            query = query.end_at(cursor[0])
        raw = query.limit_to_last(fetch).get() or {}
        rows = [(ms, oid) for oid, ms in raw.items()]
        if cursor:
            rows = [r for r in rows if r < cursor]
        rows.sort(reverse=True)
        if len(rows) >= need or len(raw) < fetch:
            return rows[:need]
        fetch *= 2


def list_orders(uid, role, month, limit, cursor):
    roles = (role,) if role in ROLES else ROLES     # 생략(또는 이상한 값)이면 전체
    now = now_ms()

    # ----- 나의 거래 일정 캘린더: 한 달치를 한 번에, 시간순 -----
    if month is not None:
        try:
            month = parse_month(month)
        except ValueError:
            raise trade_error("INVALID_TIME_RANGE")
        start, end = month_range_ms(month)

        orders = []
        for r in roles:
            raw = (db.reference(f"userOrders/{uid}/{r}")
                     .order_by_value().start_at(start).end_at(end - 1).get()) or {}
            for oid in raw:
                o = fail_if_overdue(oid)
                if o and o.get("status") != "CANCELED":      # 캘린더는 취소된 거래 제외
                    orders.append(o)
        orders.sort(key=lambda o: (o["tradeStartAt"], o["oid"]))

        db.reference(f"users/{uid}/lastSeenScheduleAt").set(now_ms())   # 메뉴 ! 없애기
        return {
            "month": month,
            "items": [_summary(o, uid, now) for o in orders],
            "nextCursor": None,
            "upcomingCount": count_upcoming(uid),
        }

    # ----- 거래 내역: 거래 시각 최신순, limit개씩 -----
    cur = _parse_cursor(cursor) if cursor else None
    rows = []
    for r in roles:
        rows += _page_rows(uid, r, cur, limit + 1)
    rows.sort(reverse=True)
    rows = rows[:limit + 1]
    has_more = len(rows) > limit
    page = rows[:limit]

    items = []
    for ms, oid in page:
        o = fail_if_overdue(oid)
        if o:
            items.append(_summary(o, uid, now))
    next_cursor = f"{page[-1][0]}_{page[-1][1]}" if has_more and page else None
    return {"items": items, "nextCursor": next_cursor}


# ---------------------------------------------------------------------
# 거래 내역 확인서  GET /orders/{oid}
# ---------------------------------------------------------------------

def get_order_detail(uid, oid):
    o = fail_if_overdue(oid) if is_valid_key(oid) else None
    if not o:
        raise trade_error("ORDER_NOT_FOUND")
    if uid not in (o.get("buyerId"), o.get("sellerId")):
        raise trade_error("FORBIDDEN")

    now = now_ms()
    data = _summary(o, uid, now)
    data.pop("counterpart")
    data.pop("hasReview")
    shown = data["displayStatus"]
    is_buyer = data["role"] == "buying"

    can_reorder = False
    if is_buyer and o.get("status") != "CONFIRMED":
        p = _get_product(o.get("pid")) or {}
        can_reorder = (not p.get("deleted") and not p.get("pendingDelete")
                       and p.get("status") == ON_SALE)

    data.update({
        "unitPrice": o.get("unitPrice"),
        "sellerId": o.get("sellerId"),
        "buyerId": o.get("buyerId"),
        "sellerNickname": o.get("sellerNickname"),
        "buyerNickname": o.get("buyerNickname"),
        "locationId": o.get("locationId"),
        "canceledBy": o.get("canceledBy"),
        "canceledAt": ms_to_iso(o.get("canceledAt")),
        "confirmedBy": o.get("confirmedBy"),
        "confirmedAt": ms_to_iso(o.get("confirmedAt")),
        "failedAt": ms_to_iso(o.get("failedAt")),
        "createdAt": ms_to_iso(o.get("createdAt")),
        "actions": {
            "canCancel": shown == "UPCOMING",
            "canComplete": shown == "AWAITING_CONFIRM",
            "canReview": is_buyer and o.get("status") == "COMPLETED" and not o.get("reviewId"),
            "canReorder": can_reorder,
        },
    })
    return data


# ---------------------------------------------------------------------
# 메뉴 ! 배지 (백1이 /auth/me 등에서 호출하는 용도)
# ---------------------------------------------------------------------

def get_order_badges(uid):
    """{"schedule": 나의 거래 일정 메뉴 !, "orders": 거래 내역 메뉴 !}
    - schedule: 판매자로서 새 예약을 받은 뒤 일정 페이지를 아직 안 봤으면
    - orders  : 내 주문 중 확정 대기(거래 시각 ~ +24시간, 아직 CONFIRMED)가 있으면"""
    user = db.reference(f"users/{uid}").get() or {}
    last_order = user.get("lastOrderAt") or 0
    last_seen = user.get("lastSeenScheduleAt") or 0

    now = now_ms()
    awaiting = False
    for role in ROLES:
        recent = (db.reference(f"userOrders/{uid}/{role}")
                    .order_by_value().start_at(now - FAIL_AFTER_MS + 1).end_at(now).get()) or {}
        if any(db.reference(f"orders/{oid}/status").get() == "CONFIRMED" for oid in recent):
            awaiting = True
            break

    return {"schedule": last_order > last_seen, "orders": awaiting}

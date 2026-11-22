"""
장바구니 (백3)

DB  carts/{uid}/{cartKey}: {pid, tradeKey, locationId, quantity, addedAt}
    cartKey = {pid}_{tradeKey}_{locationId}  → 같은 조합은 새 항목 없이 수량만 합산

- 담아도 시간·재고를 잡지 않는다 (확정은 예약 순간 선착순).
- cartKey를 '_'로 잘라 읽지 않는다 (pid에 '_'가 있을 수 있음) → 값 안의 필드에서 읽기.
- 담기·변경은 order_lock 안에서 처리: 같은 순간 예약(POST /orders)이 그 항목을 지우는 것과
  변경이 엇갈려 "예약한 항목이 장바구니에 되살아나는" 일을 막는다.
"""

from firebase_admin import db

from services.order_service import (
    fail_overdue_for_seller, location_text, parse_quantity, product_problem,
)
from services.schedule_service import block_problem
from services.trade_errors import is_valid_key, trade_error
from utils.locks import order_lock
from utils.time_utils import ms_to_iso, now_ms, parse_trade_key, trade_key_to_ms


def make_cart_key(pid, trade_key, location_id):
    return f"{pid}_{trade_key}_{location_id}"


def _get_cart_item(uid, cart_key):
    if not is_valid_key(cart_key):
        return None
    return db.reference(f"carts/{uid}/{cart_key}").get()


def _load_product_for_cart(pid):
    if not is_valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    p = db.reference(f"products/{pid}").get()
    if not p or p.get("deleted"):
        raise trade_error("PRODUCT_NOT_FOUND")
    return p


# ---------------------------------------------------------------------
# 장바구니 조회  GET /cart-items
# ---------------------------------------------------------------------

def _invalid_reason(uid, item, product, now):
    """항목 하나만 봐도 아는 문제. 없으면 None.
    순서: 주문 불가 상품 → 마감된 시간 → 일시 품절"""
    if not product or product.get("deleted"):
        return "PRODUCT_NOT_FOUND"
    problem = product_problem(product, uid)
    if problem in ("PRODUCT_NOT_AVAILABLE", "CANNOT_ORDER_OWN_PRODUCT"):
        return "PRODUCT_NOT_AVAILABLE"
    if location_text(product, item.get("locationId")) is None:
        return "INVALID_LOCATION"
    try:
        parse_trade_key(item.get("tradeKey"))
    except ValueError:
        return "BOOKING_NOT_AVAILABLE"
    time_problem = block_problem(product["sellerId"], item["tradeKey"], now)
    if time_problem:
        return time_problem
    if problem == "OUT_OF_STOCK" or (product.get("stock") or 0) < (item.get("quantity") or 0):
        return "OUT_OF_STOCK"
    return None


def get_cart(uid):
    raw = db.reference(f"carts/{uid}").get() or {}

    products = {}
    for item in raw.values():
        pid = item.get("pid")
        if pid not in products:
            products[pid] = db.reference(f"products/{pid}").get() if is_valid_key(pid) else None

    # 기한 지난 주문이 재고를 붙잡고 있으면 품절로 잘못 보이므로 먼저 정리
    sellers = {p["sellerId"] for p in products.values() if p and p.get("sellerId")}
    if sellers:
        for seller_id in sellers:
            fail_overdue_for_seller(seller_id)
        products = {pid: (db.reference(f"products/{pid}").get() if is_valid_key(pid) else None)
                    for pid in products}

    now = now_ms()
    items = []
    for cart_key, item in raw.items():
        p = products.get(item.get("pid")) or {}
        reason = _invalid_reason(uid, item, products.get(item.get("pid")), now)
        try:
            trade_start = ms_to_iso(trade_key_to_ms(item.get("tradeKey")))
        except (ValueError, TypeError):
            trade_start = None
        items.append({
            "cartKey": cart_key,
            "pid": item.get("pid"),
            "productName": p.get("name"),
            "thumbnail": (p.get("images") or [None])[0],
            "price": p.get("price"),
            "quantity": item.get("quantity"),
            "sellerId": p.get("sellerId"),
            "sellerNickname": p.get("sellerNickname"),
            "tradeKey": item.get("tradeKey"),
            "tradeStartAt": trade_start,
            "locationId": item.get("locationId"),
            "location": location_text(p, item.get("locationId")),
            "addedAt": ms_to_iso(item.get("addedAt")),
            "isValid": reason is None,
            "invalidReason": reason,
            "_addedAt": item.get("addedAt") or 0,
        })

    items.sort(key=lambda x: x["_addedAt"], reverse=True)      # 담은 순서 최신순
    for x in items:
        del x["_addedAt"]
    return items


# ---------------------------------------------------------------------
# 담기·변경 공통 검사 (order_lock 안에서 호출)
# ---------------------------------------------------------------------

def _check_product(uid, product):
    problem = product_problem(product, uid)
    if problem:
        raise trade_error(problem)


def _check_time(product, trade_key, now):
    problem = block_problem(product["sellerId"], trade_key, now)
    if problem:
        raise trade_error(problem)


def _check_stock(product, quantity):
    if (product.get("stock") or 0) < quantity:
        raise trade_error("OUT_OF_STOCK")


# ---------------------------------------------------------------------
# 장바구니 담기  POST /cart-items
# ---------------------------------------------------------------------

def add_item(uid, body):
    pid, trade_key = body.get("pid"), body.get("tradeKey")
    location_id, quantity = body.get("locationId"), body.get("quantity")

    if any(v in (None, "") for v in (pid, trade_key, location_id, quantity)):
        raise trade_error("MISSING_REQUIRED_FIELD")
    if parse_quantity(quantity) is None:
        raise trade_error("INVALID_QUANTITY")
    try:
        parse_trade_key(trade_key)
    except ValueError:
        raise trade_error("INVALID_TIME_RANGE")

    with order_lock:
        product = _load_product_for_cart(pid)
        _check_product(uid, product)
        if location_text(product, location_id) is None:
            raise trade_error("INVALID_LOCATION")
        now = now_ms()
        _check_time(product, trade_key, now)

        cart_key = make_cart_key(pid, trade_key, location_id)
        existing = _get_cart_item(uid, cart_key)
        total = (existing.get("quantity") or 0) + quantity if existing else quantity
        _check_stock(product, total)           # 이미 담긴 수량 + 새로 담는 수량 <= 재고

        db.reference(f"carts/{uid}/{cart_key}").set({
            "pid": pid,
            "tradeKey": trade_key,
            "locationId": location_id,
            "quantity": total,
            "addedAt": now,
        })

    return {"cartKey": cart_key, "quantity": total}


# ---------------------------------------------------------------------
# 장바구니 항목 변경  PATCH /cart-items/{cartKey}
# ---------------------------------------------------------------------

def update_item(uid, cart_key, body):
    changes = {k: body.get(k) for k in ("quantity", "tradeKey", "locationId") if body.get(k) is not None}
    if not changes:
        raise trade_error("MISSING_REQUIRED_FIELD")
    if "quantity" in changes and parse_quantity(changes["quantity"]) is None:
        raise trade_error("INVALID_QUANTITY")
    if "tradeKey" in changes:
        try:
            parse_trade_key(changes["tradeKey"])
        except ValueError:
            raise trade_error("INVALID_TIME_RANGE")

    with order_lock:
        item = _get_cart_item(uid, cart_key)
        if not item:
            raise trade_error("CART_ITEM_NOT_FOUND")

        pid = item.get("pid")
        product = _load_product_for_cart(pid)
        problem = product_problem(product, uid)
        if problem in ("PRODUCT_NOT_AVAILABLE", "CANNOT_ORDER_OWN_PRODUCT"):
            raise trade_error("PRODUCT_NOT_AVAILABLE")

        trade_key = changes.get("tradeKey", item.get("tradeKey"))
        location_id = changes.get("locationId", item.get("locationId"))
        quantity = changes.get("quantity", item.get("quantity"))
        now = now_ms()

        # 바꾼 것만 검사 (안 바꾼 값은 장바구니 조회의 isValid로 보여줌)
        if "locationId" in changes and location_text(product, location_id) is None:
            raise trade_error("INVALID_LOCATION")
        if "tradeKey" in changes:
            _check_time(product, trade_key, now)

        new_key = make_cart_key(pid, trade_key, location_id)
        merged = new_key != cart_key and _get_cart_item(uid, new_key)
        if merged:                            # 바꾼 결과가 이미 담긴 항목과 같으면 합침
            quantity += merged.get("quantity") or 0

        if "quantity" in changes or merged:
            if problem == "OUT_OF_STOCK":
                raise trade_error("OUT_OF_STOCK")
            _check_stock(product, quantity)

        new_item = {
            "pid": pid,
            "tradeKey": trade_key,
            "locationId": location_id,
            "quantity": quantity,
            "addedAt": item.get("addedAt") or now,    # 담은 순서 유지
        }
        if new_key == cart_key:
            db.reference(f"carts/{uid}/{cart_key}").set(new_item)
        else:
            # 옛 키 삭제 + 새 키 쓰기를 update 1번으로 (항목이 사라지거나 두 개가 되지 않게)
            db.reference().update({
                f"carts/{uid}/{cart_key}": None,
                f"carts/{uid}/{new_key}": new_item,
            })

    return {"cartKey": new_key, "quantity": quantity}


# ---------------------------------------------------------------------
# 장바구니 항목 삭제  DELETE /cart-items  (선택 삭제 포함)
# ---------------------------------------------------------------------

def delete_items(uid, cart_keys):
    if not isinstance(cart_keys, list) or not cart_keys:
        raise trade_error("MISSING_REQUIRED_FIELD")
    # 이미 없는 키는 무시하고 성공 (버튼 두 번 눌러도 에러 안 남). 이상한 글자가 든 키도 무시
    updates = {f"carts/{uid}/{k}": None for k in cart_keys if is_valid_key(k)}
    if updates:
        db.reference().update(updates)

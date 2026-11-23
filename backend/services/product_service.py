import json
from base64 import b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
from secrets import choice
from unicodedata import normalize

from firebase_admin import db

from services.order_service import fail_overdue_for_seller
from services.product_rules import ENDED, ON_SALE, TEMP_SOLD_OUT, delete_updates, status_after_stock
from services.schedule_service import get_weekly, has_schedule
from services.trade_errors import is_valid_key, trade_error
from utils.exceptions import AppError
from utils.locks import order_lock
from utils.image_upload import discard_new_upload, upload_image
from utils.time_utils import DAY_MS, ms_to_date_key, ms_to_iso, now_ms

_PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"
_CATEGORIES = {
    "KNITTING", "KEYRING_ACCESSORY", "STATIONERY", "HANDMADE", "DIY", "HOME_DECO", "OTHER",
}
_MAX_IMAGES = 10
_DEFAULT_LIMIT = 20
_MAX_LIMIT = 50
_POPULAR_DEFAULT_LIMIT = 3
_POPULAR_MAX_LIMIT = 10
_STATUSES = {ON_SALE, TEMP_SOLD_OUT, ENDED}


def _invalid(message="*상품 정보를 다시 확인해주세요."):
    return AppError(400, "INVALID_PRODUCT_DATA", message)


def _valid_key(value):
    if not is_valid_key(value) or any(ord(char) < 32 or ord(char) == 127 for char in value):
        return False
    try:
        return len(value.encode("utf-8")) <= 768
    except UnicodeEncodeError:
        return False


def _find_product(pid, *, allow_deleted=False):
    if not _valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    product = db.reference(f"products/{pid}").get()
    if product is None or (product.get("deleted") and not allow_deleted):
        raise trade_error("PRODUCT_NOT_FOUND")
    return product


def _owned_product(uid, pid, *, allow_deleted=False):
    product = _find_product(pid, allow_deleted=allow_deleted)
    if product.get("sellerId") != uid:
        raise trade_error("FORBIDDEN")
    return product


def _editable_product(uid, pid):
    product = _owned_product(uid, pid)
    if product.get("pendingDelete"):
        raise AppError(409, "PRODUCT_PENDING_DELETE", "*삭제 대기 중인 상품은 수정할 수 없어요.")
    return product


def _array(form, field):
    if field not in form:
        return None
    try:
        value = json.loads(form[field])
    except ValueError as exc:
        raise _invalid(f"*{field}는 JSON 배열로 보내주세요.") from exc
    if not isinstance(value, list):
        raise _invalid(f"*{field}는 JSON 배열로 보내주세요.")
    return value


def _nonnegative_int(raw):
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise _invalid() from exc
    if value < 0:
        raise _invalid()
    return value


def _new_push_id():
    # Firebase push key 형식. Admin SDK의 push()는 DB에 바로 쓰므로 여기서는 로컬에서 키만 만든다.
    timestamp = now_ms()
    prefix = "".join(_PUSH_CHARS[(timestamp >> shift) & 63] for shift in range(42, -1, -6))
    return prefix + "".join(choice(_PUSH_CHARS) for _ in range(12))


def _add_locations(locations, additions):
    for item in additions:
        if not isinstance(item, dict) or not isinstance(item.get("location"), str):
            raise trade_error("INVALID_LOCATION")
        location = item["location"].strip()
        if not location:
            raise trade_error("INVALID_LOCATION")
        location_id = _new_push_id()
        while location_id in locations:
            location_id = _new_push_id()
        locations[location_id] = location


def _tags(form):
    tags = _array(form, "tags")
    if tags is None:
        return None
    if len(tags) > 5 or any(not _valid_key(tag) or tag != tag.strip() for tag in tags):
        raise _invalid("*올바른 태그를 최대 5개까지 입력해주세요.")
    return dict.fromkeys(tags, True)


def _check_image_count(count):
    if not 1 <= count <= _MAX_IMAGES:
        raise _invalid("*상품 사진은 1장 이상, 최대 10장까지 등록해주세요.")


def _location_changes(product, form):
    additions = _array(form, "addLocations")
    removals = _array(form, "removeLocationIds")
    if not additions and not removals:
        return None

    locations = dict(product.get("locations") or {})
    for location_id in removals or []:
        if not _valid_key(location_id) or location_id not in locations:
            raise trade_error("INVALID_LOCATION")
        del locations[location_id]

    _add_locations(locations, additions or [])

    if not locations:
        raise _invalid("*거래 장소는 한 곳 이상 남겨주세요.")
    return locations


def _patch_updates(pid, product, form, image_count):
    fields = {}
    indexes = {}
    for field in ("name", "description"):
        if field in form:
            fields[field] = form[field].strip()
    if "name" in fields and not fields["name"]:
        raise _invalid("*상품명을 입력해주세요.")
    for field in ("price", "stock"):
        if field in form:
            fields[field] = _nonnegative_int(form[field])

    status = form.get("status")
    if status is not None and status not in (ON_SALE, ENDED):
        raise _invalid("*판매 상태를 다시 확인해주세요.")
    if status is not None or "stock" in fields:
        stock = fields.get("stock", product.get("stock") or 0)
        base_status = status if status is not None else product.get("status")
        fields["status"] = status_after_stock(base_status, stock)

    if "category" in form:
        category = form["category"]
        if category not in _CATEGORIES:
            raise _invalid("*상품 카테고리를 다시 확인해주세요.")
        old_category = product.get("category")
        fields["category"] = category
        if old_category != category:
            if _valid_key(old_category):
                indexes[f"categoryProducts/{old_category}/{pid}"] = None
            indexes[f"categoryProducts/{category}/{pid}"] = product.get("createdAt") or now_ms()

    new_tags = _tags(form)
    if new_tags is not None:
        old_tags = {tag for tag in (product.get("tags") or {}) if _valid_key(tag)}
        fields["tags"] = new_tags or None
        for tag in old_tags - new_tags.keys():
            indexes[f"tagProducts/{tag}/{pid}"] = None
        for tag in new_tags.keys() - old_tags:
            indexes[f"tagProducts/{tag}/{pid}"] = True

    locations = _location_changes(product, form)
    if locations is not None:
        fields["locations"] = locations

    kept_images = _array(form, "keepImages")
    old_images = product.get("images") or []
    if kept_images is None and image_count:
        kept_images = list(old_images)
    if kept_images is not None:
        if any(not isinstance(url, str) or url not in old_images for url in kept_images):
            raise _invalid("*기존 상품 사진만 유지할 수 있어요.")
        if len(set(kept_images)) != len(kept_images):
            raise _invalid("*상품 사진은 1장 이상, 최대 10장까지 등록해주세요.")
        _check_image_count(len(kept_images) + image_count)
        fields["images"] = kept_images

    if not fields:
        raise _invalid("*수정할 상품 정보를 입력해주세요.")
    return fields, indexes


def create_product(uid, form, files):
    name = (form.get("name") or "").strip()
    category = (form.get("category") or "").strip()
    price = form.get("price")
    stock = form.get("stock")
    locations_form = _array(form, "locations")
    files = [file for file in files if file.filename]
    if not all((name, category, price, stock, locations_form, files)):
        raise trade_error("MISSING_REQUIRED_FIELD")
    if category not in _CATEGORIES:
        raise _invalid("*상품 카테고리를 다시 확인해주세요.")
    price, stock = _nonnegative_int(price), _nonnegative_int(stock)
    if stock < 1:
        raise _invalid("*등록할 상품의 재고는 1개 이상이어야 해요.")
    _check_image_count(len(files))

    locations = {}
    _add_locations(locations, locations_form)
    tags = _tags(form) or {}
    seller = db.reference(f"users/{uid}").get()
    if not seller:
        raise AppError(404, "USER_NOT_FOUND", "*존재하지 않는 사용자입니다.")
    if not has_schedule(get_weekly(uid)):
        raise trade_error("SCHEDULE_NOT_FOUND")

    pid = _new_push_id()
    images = []
    try:
        for file in files:
            images.append(upload_image(file, f"products/{pid}"))
    except AppError:
        for url in images:
            discard_new_upload(url)
        raise

    created_at = now_ms()
    product = {
        "sellerId": uid,
        "sellerNickname": seller.get("nickname"),
        "sellerImage": seller.get("profileImage"),
        "name": name,
        "description": (form.get("description") or "").strip(),
        "category": category,
        "price": price,
        "stock": stock,
        "status": ON_SALE,
        "images": images,
        "locations": locations,
        "tags": tags,
        "activeOrderCount": 0,
        "likeCount": 0,
        "viewCount": 0,
        "soldCount": 0,
        "ratingSum": 0,
        "reviewCount": 0,
        "pendingDelete": False,
        "deleted": False,
        "createdAt": created_at,
        "updatedAt": created_at,
    }
    updates = {
        f"products/{pid}": product,
        f"userProducts/{uid}/{pid}": created_at,
        f"categoryProducts/{category}/{pid}": created_at,
    }
    updates.update({f"tagProducts/{tag}/{pid}": True for tag in tags})
    db.reference().update(updates)
    return {"pid": pid, "status": ON_SALE, "createdAt": ms_to_iso(created_at)}


def _ranking_scores(day):
    scores = db.reference(f"rankingDaily/{day}/products").get() or {}
    return {pid: score for pid, score in scores.items() if type(score) is int and score > 0}


def _yesterday_key():
    return ms_to_date_key(now_ms() - DAY_MS)


def _query_limit(query, default=_DEFAULT_LIMIT, maximum=_MAX_LIMIT):
    limit = _nonnegative_int(query.get("limit", default))
    if not 1 <= limit <= maximum:
        raise _invalid(f"*조회 개수는 1~{maximum} 사이여야 해요.")
    return limit


def _sort_key(item, sort, scores):
    pid, product = item
    if sort == "popular":
        return scores.get(pid, 0), 0, pid
    sales = (product.get("soldCount") or 0) if sort == "soldCount" else 0
    return sales, product.get("createdAt") or 0, pid


def _encode_cursor(filters, key):
    data = json.dumps([*filters, *key], separators=(",", ":")).encode()
    return urlsafe_b64encode(data).decode().rstrip("=")


def _decode_cursor(cursor, filters, *, key_size=3):
    if cursor is None:
        return None
    try:
        data = b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True)
        payload = json.loads(data)
        if (not isinstance(payload, list) or len(payload) != len(filters) + key_size or
                payload[:-key_size] != list(filters) or
                any(type(value) is not int for value in payload[-key_size:-1]) or
                not _valid_key(payload[-1])):
            raise ValueError("Invalid product cursor")
        return tuple(payload[-key_size:])
    except (Base64Error, ValueError) as exc:
        raise _invalid("*상품 목록 조회 위치를 다시 확인해주세요.") from exc


def _product_card(pid, product, is_liked):
    images = product.get("images") or []
    return {
        "pid": pid,
        "name": product.get("name"),
        "images": images,
        "image": images[0] if images else None,
        "price": product.get("price"),
        "status": product.get("status"),
        "sellerId": product.get("sellerId"),
        "sellerNickname": product.get("sellerNickname"),
        "sellerImage": product.get("sellerImage"),
        "isLiked": is_liked,
    }


def _normalize_search_text(value):
    return normalize("NFC", value).casefold() if isinstance(value, str) else ""


def _user_likes(uid):
    return db.reference(f"likes/{uid}").get() or {}


def list_products(uid, query):
    sort = query.get("sort", "newest")
    seller_id = query.get("sellerId")
    category = query.get("category")
    status = query.get("status")
    keyword = _normalize_search_text(query.get("query")).strip()
    if sort not in ("newest", "soldCount", "popular"):
        raise _invalid("*상품 정렬 조건을 다시 확인해주세요.")
    if seller_id is not None and not _valid_key(seller_id):
        raise _invalid("*판매자 ID를 다시 확인해주세요.")
    if category is not None and category not in _CATEGORIES:
        raise _invalid("*상품 카테고리를 다시 확인해주세요.")
    if status is not None and status not in _STATUSES:
        raise _invalid("*상품 판매 상태를 다시 확인해주세요.")
    limit = _query_limit(query)

    filters = sort, seller_id, category, status
    if keyword:
        filters += (keyword,)
    ranking_day = _yesterday_key() if sort == "popular" else None
    if ranking_day:
        filters += (ranking_day,)
    after = _decode_cursor(query.get("cursor"), filters)
    scores = _ranking_scores(ranking_day) if ranking_day else {}
    products = db.reference("products").get() or {}
    matching = [
        (pid, product) for pid, product in products.items()
        if isinstance(product, dict)
        and not product.get("deleted")
        and (sort != "popular" or not product.get("pendingDelete"))
        and (seller_id is None or product.get("sellerId") == seller_id)
        and (category is None or product.get("category") == category)
        and (status is None or product.get("status") == status)
        and (not keyword or keyword in _normalize_search_text(product.get("name")))
    ]
    def sort_key(item):
        return _sort_key(item, sort, scores)

    matching.sort(key=sort_key, reverse=True)
    if after is not None:
        matching = [item for item in matching if sort_key(item) < after]
    page = matching[:limit]
    likes = _user_likes(uid) if uid and page else {}
    next_cursor = _encode_cursor(filters, sort_key(page[-1])) if len(matching) > limit else None
    return {
        "items": [_product_card(pid, product, pid in likes) for pid, product in page],
        "nextCursor": next_cursor,
    }


def list_popular_products(uid, query):
    limit = _query_limit(query, _POPULAR_DEFAULT_LIMIT, _POPULAR_MAX_LIMIT)
    scores = _ranking_scores(_yesterday_key())
    candidates = sorted(scores, key=lambda pid: (scores[pid], pid), reverse=True)
    likes = _user_likes(uid) if uid and candidates else {}
    rankings = []
    previous_score = None
    rank = 0
    for pid in candidates:
        product = db.reference(f"products/{pid}").get()
        if not isinstance(product, dict) or product.get("deleted") or product.get("pendingDelete"):
            continue
        if scores[pid] != previous_score:
            previous_score = scores[pid]
            rank = len(rankings) + 1
        card = _product_card(pid, product, pid in likes)
        card.update(rank=rank, soldCount=product.get("soldCount") or 0)
        rankings.append(card)
        if len(rankings) == limit:
            break
    return rankings


def like_product(uid, pid):
    if not _valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    like_path = f"likes/{uid}/{pid}"
    with order_lock:
        if db.reference(like_path).get() is not None:
            return
        product = _find_product(pid)
        liked_at = now_ms()
        score_path = f"rankingDaily/{ms_to_date_key(liked_at)}/products/{pid}"
        score = db.reference(score_path).get() or 0
        db.reference().update({
            like_path: liked_at,
            f"productLikes/{pid}/{uid}": True,
            f"products/{pid}/likeCount": (product.get("likeCount") or 0) + 1,
            score_path: score + 1,
        })


def unlike_product(uid, pid):
    if not _valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    like_path = f"likes/{uid}/{pid}"
    with order_lock:
        liked_at = db.reference(like_path).get()
        if liked_at is None:
            return
        updates = {
            like_path: None,
            f"productLikes/{pid}/{uid}": None,
        }
        product = db.reference(f"products/{pid}").get()
        if isinstance(product, dict):
            updates[f"products/{pid}/likeCount"] = max(0, (product.get("likeCount") or 0) - 1)
        today = ms_to_date_key(now_ms())
        if type(liked_at) is int and ms_to_date_key(liked_at) == today:
            score_path = f"rankingDaily/{today}/products/{pid}"
            score = db.reference(score_path).get() or 0
            updates[score_path] = max(0, score - 1)
        db.reference().update(updates)


def list_liked_products(uid, query):
    limit = _query_limit(query)
    filters = ("likes", uid)
    after = _decode_cursor(query.get("cursor"), filters, key_size=2)
    candidates = sorted(
        ((liked_at, pid) for pid, liked_at in _user_likes(uid).items()
         if type(liked_at) is int and (after is None or (liked_at, pid) < after)),
        reverse=True,
    )
    items = []
    next_cursor = None
    last_key = None
    for liked_at, pid in candidates:
        product = db.reference(f"products/{pid}").get()
        if not isinstance(product, dict) or product.get("deleted"):
            continue
        if len(items) == limit:
            next_cursor = _encode_cursor(filters, last_key)
            break
        card = _product_card(pid, product, True)
        card["likedAt"] = ms_to_iso(liked_at)
        items.append(card)
        last_key = (liked_at, pid)
    return {"items": items, "nextCursor": next_cursor}


def get_product(uid, pid):
    product = _find_product(pid)
    seller_id = product.get("sellerId")
    if seller_id and product.get("activeOrderCount") != 0:
        fail_overdue_for_seller(seller_id)
        product = _find_product(pid)

    data = {
        "pid": pid,
        "name": product.get("name"),
        "description": product.get("description"),
        "category": product.get("category"),
        "price": product.get("price"),
        "images": product.get("images") or [],
        "tags": list(product.get("tags") or {}),
        "locations": [
            {"locationId": key, "location": name}
            for key, name in (product.get("locations") or {}).items()
        ],
        "status": product.get("status"),
        "seller": {
            "uid": seller_id,
            "nickname": product.get("sellerNickname"),
            "image": product.get("sellerImage"),
        },
        "isLiked": bool(uid and db.reference(f"likes/{uid}/{pid}").get() is not None),
        "createdAt": ms_to_iso(product.get("createdAt")),
    }
    if uid and uid == seller_id:
        data["stock"] = product.get("stock") or 0
        data["pendingDelete"] = bool(product.get("pendingDelete"))
    return data


def update_product(uid, pid, form, files):
    files = [file for file in files if file.filename]
    uploaded = []
    try:
        if files:
            with order_lock:
                product = _editable_product(uid, pid)
                _patch_updates(pid, product, form, len(files))
            # Storage 전송 동안에는 다른 예약과 상품 상태 변경이 진행될 수 있다.
            for file in files:
                uploaded.append(upload_image(file, f"products/{pid}"))

        with order_lock:
            product = _editable_product(uid, pid)
            fields, updates = _patch_updates(pid, product, form, len(uploaded))
            if uploaded:
                fields["images"] += uploaded
            fields["updatedAt"] = now_ms()
            updates.update({f"products/{pid}/{field}": value for field, value in fields.items()})
            db.reference().update(updates)
    except AppError:
        for url in uploaded:
            discard_new_upload(url)
        raise

    return {
        "pid": pid,
        "status": fields.get("status", product.get("status")),
        "updatedAt": ms_to_iso(fields["updatedAt"]),
    }


def delete_product(uid, pid):
    with order_lock:
        product = _owned_product(uid, pid, allow_deleted=True)
        if product.get("deleted"):
            return

        count = product.get("activeOrderCount")
        updates = {}
        if count is None:
            orders = db.reference("orders").get() or {}
            count = sum(
                order.get("pid") == pid and order.get("status") == "CONFIRMED"
                for order in orders.values()
            )
            updates[f"products/{pid}/activeOrderCount"] = count

        if count == 0:
            updates.update(delete_updates(pid))
        else:
            updates[f"products/{pid}/status"] = ENDED
            updates[f"products/{pid}/pendingDelete"] = True
        updates[f"products/{pid}/updatedAt"] = now_ms()
        db.reference().update(updates)

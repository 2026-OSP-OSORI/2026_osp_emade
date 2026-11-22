import json
from secrets import choice

from firebase_admin import db

from services.product_rules import ENDED, ON_SALE, delete_updates, status_after_stock
from services.trade_errors import is_valid_key, trade_error
from utils.exceptions import AppError
from utils.locks import order_lock
from utils.image_upload import discard_new_upload, upload_image
from utils.time_utils import ms_to_iso, now_ms

_PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"
_CATEGORIES = {
    "KNITTING", "KEYRING_ACCESSORY", "STATIONERY", "HANDMADE", "DIY", "HOME_DECO", "OTHER",
}
_MAX_IMAGES = 10


def _invalid(message="*상품 정보를 다시 확인해주세요."):
    return AppError(400, "INVALID_PRODUCT_DATA", message)


def _valid_key(value):
    return is_valid_key(value) and not any(ord(char) < 32 or ord(char) == 127 for char in value)


def _owned_product(uid, pid, *, allow_deleted=False):
    if not _valid_key(pid):
        raise trade_error("PRODUCT_NOT_FOUND")
    product = db.reference(f"products/{pid}").get()
    if product is None or (product.get("deleted") and not allow_deleted):
        raise trade_error("PRODUCT_NOT_FOUND")
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


def _new_location_id():
    # Firebase push key 형식. Admin SDK의 push()는 DB에 바로 쓰므로 여기서는 로컬에서 키만 만든다.
    timestamp = now_ms()
    prefix = "".join(_PUSH_CHARS[(timestamp >> shift) & 63] for shift in range(42, -1, -6))
    return prefix + "".join(choice(_PUSH_CHARS) for _ in range(12))


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

    for item in additions or []:
        if not isinstance(item, dict) or not isinstance(item.get("location"), str):
            raise trade_error("INVALID_LOCATION")
        location = item["location"].strip()
        if not location:
            raise trade_error("INVALID_LOCATION")
        location_id = _new_location_id()
        while location_id in locations:
            location_id = _new_location_id()
        locations[location_id] = location

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

    tags = _array(form, "tags")
    if tags is not None:
        if len(tags) > 5 or any(not _valid_key(tag) or tag != tag.strip() for tag in tags):
            raise _invalid("*올바른 태그를 최대 5개까지 입력해주세요.")
        old_tags = {tag for tag in (product.get("tags") or {}) if _valid_key(tag)}
        new_tags = dict.fromkeys(tags, True)
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
        if len(set(kept_images)) != len(kept_images) or not 1 <= len(kept_images) + image_count <= _MAX_IMAGES:
            raise _invalid("*상품 사진은 1장 이상, 최대 10장까지 등록해주세요.")
        fields["images"] = kept_images

    if not fields:
        raise _invalid("*수정할 상품 정보를 입력해주세요.")
    return fields, indexes


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

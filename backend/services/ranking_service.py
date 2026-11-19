from firebase_admin import db


# seller를 받아서 seller["soldCount"]를 돌려주는 함수
def _sold_count(seller):
    return seller["soldCount"]

# 순위 규칙 함수 - 판매 1건 이상인 판매자 전체를 순위와 함께 반환
def _ranked_sellers():
    users = db.reference("users").get() or {}

    # 1. 판매 1건 이상인 사람만 모으기
    sellers = []
    for uid, user in users.items():
        sold = user.get("soldCount", 0)
        if sold > 0:
            sellers.append({
                "uid": uid,
                "nickname": user.get("nickname"),
                "profileImage": user.get("profileImage"),
                "soldCount": sold,
            })

    # 2. 판매 수 많은 순으로 정렬
    sellers.sort(key=_sold_count, reverse=True)

    # 3. 순위 매기기 (판매 수가 같으면 같은 순위)
    for i in range(len(sellers)):
        if i > 0 and sellers[i]["soldCount"] == sellers[i - 1]["soldCount"]:
            sellers[i]["rank"] = sellers[i - 1]["rank"] # 앞사람이랑 같으면 같은 순위
        else:
            sellers[i]["rank"] = i + 1 # 아니면 지금 위치가 순위

    return sellers


# 판매자 uid를 받아서 순위 반환, 판매 0건이면 None
def get_seller_rank(uid):
    for seller in _ranked_sellers():
        if seller["uid"] == uid:
            return seller["rank"]
    return None # 프론트에서 - 표시하도록 처리 (예: -위)


# 판매 순위 상위 (limit)명 가져오기
def get_top_sellers(limit):
    return _ranked_sellers()[:limit]

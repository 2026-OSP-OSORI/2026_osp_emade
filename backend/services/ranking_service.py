from firebase_admin import db


# 판매 순위 계산하는 함수, 누적 판매 수(users.soldCount) 기준 순위. 판매 0건이면 None
def get_seller_rank(uid):
    users = db.reference("users").get() or {}
    my_sold = (users.get(uid) or {}).get("soldCount", 0) # soldCount 값이 없을 때 기본값 0
    
    if my_sold == 0:
        return None # 프론트에서 - 표시하도록 처리 (예: -위)

    higher = 0
    
    for user in users.values():
        if user.get("soldCount", 0) > my_sold:   # 나보다 많이 팔았으면
            higher += 1                          # 한 명 추가
            
    return higher + 1 # 순위는 나보다 많이 팔았던 사람 수 + 1


# seller를 받아서 seller["soldCount"]를 돌려주는 함수
def _sold_count(seller):
    return seller["soldCount"]


# 판매 순위 상위 (limit)명 가져오기
def get_top_sellers(limit):
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
    result = []
    for i in range(len(sellers)):
        if len(result) == limit:
            break
        
        seller = sellers[i]
        if i > 0 and seller["soldCount"] == sellers[i - 1]["soldCount"]:
            rank = result[-1]["rank"] # 앞사람이랑 같으면 같은 순위
            
        else:
            rank = i + 1 # 아니면 지금 위치가 순위
            
        result.append({"rank": rank, **seller}) # → {"rank": 1, "uid": "-NxA8f2k...", "nickname": "오소리", "soldCount": 150}

    return result
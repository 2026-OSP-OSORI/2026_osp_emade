from firebase_admin import db

from backend.routes import users


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
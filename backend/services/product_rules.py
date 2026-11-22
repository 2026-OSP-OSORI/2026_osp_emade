"""
상품 공용 규칙 (백2·백3 공용)

※ 임시본: 백2가 상품 코드를 올리면 백2 정의로 교체한다.
   함수 이름·인자·돌려주는 모양은 그대로 유지해야 주문 쪽 코드가 안 깨진다.
"""

ON_SALE = "ON_SALE"
TEMP_SOLD_OUT = "TEMP_SOLD_OUT"
ENDED = "ENDED"


def status_after_stock(current_status, new_stock):
    """재고가 바뀐 뒤의 상품 status.
    판매자가 직접 내린 ENDED는 재고와 상관없이 유지, 그 외에는 재고 > 0 이면 ON_SALE, 0이면 TEMP_SOLD_OUT."""
    if current_status == ENDED:
        return ENDED
    return ON_SALE if new_stock > 0 else TEMP_SOLD_OUT


def delete_updates(pid):
    """상품을 최종 삭제할 때 쓸 경로들을 dict로만 돌려준다.
    - lock을 잡지 않는다 (부르는 쪽이 이미 order_lock 안).
    - DB에 쓰지 않는다 (부르는 쪽이 자기 update에 합쳐서 한 번에 씀).
    TODO(백2): 색인(categoryProducts, tagProducts 등) 정리가 필요하면 백2 정의에서 추가."""
    return {
        f"products/{pid}/deleted": True,
        f"products/{pid}/pendingDelete": False,
        f"products/{pid}/status": ENDED,
    }

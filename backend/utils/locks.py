from threading import Lock


# 재고·주문 상태를 검사하고 갱신하는 서비스가 같은 락을 사용한다.
order_lock = Lock()

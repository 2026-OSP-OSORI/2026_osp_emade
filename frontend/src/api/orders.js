// 주문(거래) API — 백3 API 명세 기준
import { api } from "./client";

// 거래 내역 확인서 (리뷰 작성 화면 왼쪽 상품 정보에도 사용)
//   리뷰 작성에서 쓰는 값: thumbnail(상품 사진), productName(상품명), tradeStartAt(구매일)
export const getOrder = (oid) => api.get(`/orders/${oid}`);

// 거래 확정 (거래확정 화면의 '거래 완료')
export const completeTrade = (oid) => api.patch(`/orders/${oid}/complete`);

// 거래 취소 (거래 내역 확인서)
export const cancelTrade = (oid) => api.patch(`/orders/${oid}/cancel`);

// 거래 예약 (바로 구매는 items 1개, 장바구니는 여러 개 — 하나라도 안 되면 전부 실패)
//   items: [{ pid, tradeKey, locationId, quantity, cartKey? }]  → [{ oid, status, tradeStartAt }]
export const createOrders = (items) => api.post("/orders", { items });

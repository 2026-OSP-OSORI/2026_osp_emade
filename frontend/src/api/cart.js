// 장바구니 API — 백3 API 명세 기준 (backend/routes/cart_items.py)
import { api } from "./client";

// 장바구니 조회 → [{ cartKey, pid, productName, thumbnail, price, quantity, sellerId, sellerNickname,
//                   tradeKey, tradeStartAt, locationId, location, isValid, invalidReason }]
export const getCart = () => api.get("/cart-items");

// 장바구니 담기 (같은 상품·시간·장소면 수량만 더해짐) → { cartKey, quantity }
export const addCartItem = ({ pid, tradeKey, locationId, quantity }) =>
  api.post("/cart-items", { pid, tradeKey, locationId, quantity });

// 수량·시간·장소 변경 (바꿀 것만) → { cartKey, quantity }  ※ 시간·장소를 바꾸면 cartKey 도 바뀜
export const updateCartItem = (cartKey, changes) =>
  api.patch(`/cart-items/${encodeURIComponent(cartKey)}`, changes);

// 선택 삭제
export const deleteCartItems = (cartKeys) => api.delete("/cart-items", { cartKeys });

// 장바구니 항목이 담기지 못하는 이유 → 화면 문구
export const CART_INVALID_LABEL = {
  PRODUCT_NOT_FOUND: "삭제된 상품",
  PRODUCT_NOT_AVAILABLE: "판매 중단",
  INVALID_LOCATION: "거래 장소 변경됨",
  PAST_TIME_BLOCK: "마감된 시간",
  BOOKING_NOT_AVAILABLE: "마감된 시간",
  BOOKING_CONFLICT: "이미 예약된 시간",
  OUT_OF_STOCK: "재고 부족",
};

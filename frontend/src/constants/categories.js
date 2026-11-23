// 상품 카테고리 목록 — Header 카테고리 메뉴, 상품 목록/등록 페이지에서 같이 사용합니다.
// 카테고리 이동: /products?category=뜨개질
export const CATEGORIES = ["뜨개질", "키링/액세서리", "문구", "수공예품", "DIY", "홈데코", "기타"];

// 백엔드 상품 category 값 (backend/services/product_service.py _CATEGORIES) ↔ 화면 이름
export const CATEGORY_CODES = {
  뜨개질: "KNITTING",
  "키링/액세서리": "KEYRING_ACCESSORY",
  문구: "STATIONERY",
  수공예품: "HANDMADE",
  DIY: "DIY",
  홈데코: "HOME_DECO",
  기타: "OTHER",
};

// "KNITTING" → "뜨개질" (모르는 값은 그대로)
export const categoryLabel = (code) =>
  Object.keys(CATEGORY_CODES).find((label) => CATEGORY_CODES[label] === code) ?? code ?? "";

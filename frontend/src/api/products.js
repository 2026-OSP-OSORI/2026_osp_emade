// 상품 API — 노션 "백2 / API 명세" 기준
//   목록 응답: { items: [...], nextCursor }  (커서 방식 — 다음 페이지는 cursor=nextCursor)
//   상품 카드(Card)는 image 한 장을 받으므로 toCardProduct 로 바꿔서 넘깁니다.
import { api } from "./client";

// 빈 값은 빼고 ?a=1&b=2 만들기
const toQuery = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

// ---------- 조회 ----------

// 인기 상품 (어제 랭킹 점수 순) — limit 기본 3, 최대 10
//   → [{ rank, pid, name, images, price, status, soldCount, sellerId }]
export const getPopularProducts = ({ limit } = {}) =>
  api.get(`/products/popular${toQuery({ limit })}`);

// 상품 목록 · 검색 · 판매자별 목록 (모두 GET /products)
//   params: { query, sellerId, category(KNITTING 등), status, sort(newest|popular|soldCount), cursor, limit }
//   → { items: [{ pid, name, images, price, status, sellerId, sellerNickname, sellerImage, isLiked }], nextCursor }
export const getProducts = (params = {}) => api.get(`/products${toQuery(params)}`);

// 상품 상세
//   → { pid, name, description, category, price, images, tags, locations: [{ locationId, location }],
//       status, seller: { uid, nickname, image }, isLiked, createdAt,
//       stock·pendingDelete (판매자 본인에게만) }
export const getProduct = (pid) => api.get(`/products/${pid}`);

// ---------- 등록 / 수정 / 삭제 (판매자) ----------
// multipart/form-data, 배열 값은 JSON 문자열

// 상품 등록 — locations: ["정문", ...] (1개 이상), tags: 최대 5개, images: File 1~10개
export const createProduct = ({ name, category, price, stock, description, tags = [], locations = [], images = [] }) => {
  const body = new FormData();
  body.append("name", name);
  body.append("category", category);
  body.append("price", price);
  body.append("stock", stock);
  body.append("description", description);
  body.append("tags", JSON.stringify(tags));
  body.append("locations", JSON.stringify(locations.map((location) => ({ location }))));
  images.forEach((file) => body.append("images", file));
  return api.post("/products", body);
};

// 상품 수정 · 판매 상태 변경 — 바꾼 값만 넘기면 됩니다.
//   keepImages: 남길 기존 사진 URL, images: 새 File
//   addLocations: ["새 장소"], removeLocationIds: ["locationId"]
//   status: "ON_SALE" | "ENDED" (판매 중단)
//   삭제 대기 상품은 409 PRODUCT_PENDING_DELETE
export const updateProduct = (pid, changes) => {
  const body = new FormData();
  const { images = [], addLocations, keepImages, removeLocationIds, tags, ...fields } = changes;
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) body.append(key, value);
  });
  if (tags) body.append("tags", JSON.stringify(tags));
  if (keepImages) body.append("keepImages", JSON.stringify(keepImages));
  if (addLocations?.length) {
    body.append("addLocations", JSON.stringify(addLocations.map((location) => ({ location }))));
  }
  if (removeLocationIds?.length) body.append("removeLocationIds", JSON.stringify(removeLocationIds));
  images.forEach((file) => body.append("images", file));
  return api.patch(`/products/${pid}`, body);
};

// 상품 삭제 (진행 중인 거래가 있으면 '삭제 대기'로 처리됨)
export const deleteProduct = (pid) => api.delete(`/products/${pid}`);

// ---------- 거래 가능 시간 (백3 스케줄 API) ----------

// 예약 가능 날짜 → { month, dates: [{ date: "2026-11-16", hasOpenBlock }] }
export const getAvailableDates = (pid, month) =>
  api.get(`/products/${pid}/available-dates${toQuery({ month })}`);

// 예약 가능 시간 → { date, blocks: [{ tradeKey, startTime: "14:00", state: "OPEN" | "BOOKED" }] }
export const getAvailableBlocks = (pid, date) =>
  api.get(`/products/${pid}/available-blocks${toQuery({ date })}`);

// ---------- 응답 정리 ----------

// 목록 응답 → { list, nextCursor }  (배열만 와도 처리)
export const toProductList = (data) => ({
  list: Array.isArray(data) ? data : (data?.items ?? data?.products ?? []),
  nextCursor: data?.nextCursor ?? null,
});

// 상품 → Card 컴포넌트 모양 { pid, name, price, image, sellerNickname, sellerImage, isLiked }
export const toCardProduct = (p) => ({
  ...p,
  image: p.image ?? p.images?.[0],
  sellerNickname: p.sellerNickname ?? p.seller?.nickname,
  sellerImage: p.sellerImage ?? p.seller?.image,
});

// 상세 응답의 locations 를 [{ id, name }] 로 (명세: [{ locationId, location }])
export const toLocations = (locations) =>
  Array.isArray(locations)
    ? locations.map((l) => ({ id: l.locationId ?? l.id, name: l.location ?? l.name }))
    : Object.entries(locations ?? {}).map(([id, name]) => ({ id, name }));

// 판매 상태 → 화면 문구
export const STATUS_LABEL = {
  ON_SALE: "판매중",
  TEMP_SOLD_OUT: "일시 품절",
  ENDED: "판매 중단",
};

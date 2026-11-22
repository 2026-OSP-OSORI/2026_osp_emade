// 리뷰 API — backend/routes/reviews.py 기준
import { api } from "./client";

// 쿼리 문자열 만들기 (값이 없는 항목은 빼기)
const toQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

// 리뷰 목록 정렬 값 (백엔드와 같은 값)
export const REVIEW_SORTS = [
  { value: "latest", label: "최신순" },
  { value: "rating_high", label: "평점 높은 순" },
  { value: "rating_low", label: "평점 낮은 순" },
  { value: "helpful", label: "도움순" },
];

// 상품 리뷰 목록 → { total, page, reviews: [...] }
export const getProductReviews = (
  pid,
  { sort = "latest", photoOnly = false, page = 1, limit = 10 } = {},
) =>
  api.get(
    `/products/${pid}/reviews${toQuery({ sort, photoOnly, page, limit })}`,
  );

// 상품 리뷰 별점 요약 → { averageRating, reviewCount, ratingDistribution, photoReviewCount, photoPreviews }
export const getReviewSummary = (pid) =>
  api.get(`/products/${pid}/reviews/summary`);

// 리뷰 상세
export const getReviewDetail = (rid) => api.get(`/reviews/${rid}`);

// 리뷰 작성 (사진 때문에 FormData) → { rid }
//   form: { oid, title, rating, content, images: File[] }
export const createReview = ({ oid, title, rating, content, images = [] }) => {
  const body = new FormData();
  body.append("oid", oid);
  body.append("title", title);
  body.append("rating", rating);
  body.append("content", content);
  images.forEach((file) => body.append("images", file));
  return api.post("/reviews", body);
};

// 리뷰 수정
//   keepImages: 남길 기존 사진 URL 목록, images: 새로 올릴 File 목록
export const updateReview = (
  rid,
  { title, rating, content, keepImages = [], images = [] },
) => {
  const body = new FormData();
  body.append("title", title);
  body.append("rating", rating);
  body.append("content", content);
  keepImages.forEach((url) => body.append("keepImages", url));
  images.forEach((file) => body.append("images", file));
  return api.patch(`/reviews/${rid}`, body);
};

export const deleteReview = (rid) => api.delete(`/reviews/${rid}`);

// 도움돼요 / 도움돼요 취소
export const addHelpful = (rid) => api.post(`/reviews/${rid}/helpful`);
export const removeHelpful = (rid) => api.delete(`/reviews/${rid}/helpful`);

// 판매자 답글 → { sellerRepliedAt }
export const addSellerReply = (rid, content) =>
  api.post(`/reviews/${rid}/reply`, { content });

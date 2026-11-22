// 상품 API — 백2 API 명세 기준 (메인 화면에서 쓰는 것만)
//   응답 상품 모양은 Card 컴포넌트 기준: { pid, name, price, image, sellerNickname, sellerImage, isLiked }
import { api } from "./client";

// 인기 상품 조회
export const getPopularProducts = () => api.get("/products/popular");

// 상품 목록 조회
//   TODO: 명세에 추천 상품 API 가 따로 없어서, 메인 추천 상품은 상품 목록 앞에서부터 보여 줍니다.
export const getProducts = () => api.get("/products");

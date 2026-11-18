// 찜 API — API 명세 "찜 등록 / 찜 취소"
// Card 컴포넌트가 하트를 누르면 자동으로 사용합니다.
import { api } from "./client";

export const addLike = (pid) => api.post(`/products/${pid}/likes`);
export const removeLike = (pid) => api.delete(`/products/${pid}/likes`);

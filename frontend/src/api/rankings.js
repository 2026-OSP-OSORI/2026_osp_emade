// 랭킹 API — backend/routes/rankings.py
import { api } from "./client";

// 인기 판매자 → [{ uid, nickname, profileImage, soldCount, rank }]  (판매 수 같으면 같은 순위)
export const getTopSellers = (limit = 6) => api.get(`/rankings/sellers?limit=${limit}`);

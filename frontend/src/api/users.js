// 회원 API — backend/routes/users.py (판매자 프로필·팔로우)
import { api } from "./client";

// 판매자 프로필 → { uid, nickname, profileImage, sellerRank(없으면 null), followingCount, followerCount, isFollowing, isMe }
export const getUserProfile = (uid) => api.get(`/users/${uid}`);

export const followUser = (uid) => api.post(`/users/${uid}/follows`);
export const unfollowUser = (uid) => api.delete(`/users/${uid}/follows`);

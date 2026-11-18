// 인증 / 회원 API — API 명세 기준
// 로그인 방식: Flask 세션(쿠키). 로그인 성공 시 Flask 가 쿠키를 심어 주고,
// 이후 요청에는 client.js 가 쿠키를 자동으로 함께 보냅니다.
import { api } from "./client";

// 회원가입 화면
// TODO: 쿼리 이름(email, nickname)은 백엔드와 확인
export const checkEmail = (email) =>
  api.get(`/users/check-email?email=${encodeURIComponent(email)}`);
export const checkNickname = (nickname) =>
  api.get(`/users/check-nickname?nickname=${encodeURIComponent(nickname)}`);
export const signup = (form) => api.post("/auth/signup", form);

// 로그인 / 로그아웃
export const login = (form) => api.post("/auth/login", form);
export const logout = () => api.post("/auth/logout");

// 로그인 상태 확인 (Header, 새로고침 시 AuthProvider 에서 사용)
export const getMe = () => api.get("/auth/me");

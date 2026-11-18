// 로그인 방식: Flask 세션(쿠키)
//
// 앱이 켜질 때(새로고침 포함) GET /auth/me 로 로그인 상태를 확인합니다.
// 확인이 끝나기 전에는 isLoading 이 true 입니다.
import { useEffect, useState } from "react";
import { getMe, logout as logoutApi } from "../api/auth";
import { AuthContext } from "../hooks/useAuth";

// /auth/me 응답(data)에서 사용자 정보만 꺼내기 — 로그인 안 했으면 null
// 백엔드 응답 모양이 아래 중 무엇이든 처리합니다.
//   { user: {...} }      → 로그인
//   { user: null }       → 로그아웃
//   { uid, nickname }    → 로그인
//   null                 → 로그아웃
//   { loggedIn: false }  → 로그아웃
function toUser(data) {
  if (!data || data.loggedIn === false) return null;
  if ("user" in data) return data.user ?? null;
  return data;
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((data) => setUser(toUser(data)))
      .catch(() => setUser(null)) // 401, 서버 꺼짐 등 → 로그아웃 상태로
      .finally(() => setIsLoading(false));
  }, []);

  const value = {
    user, // 로그인한 사용자 정보 (로그아웃 상태면 null)
    isLoggedIn: Boolean(user),
    isLoading, // 로그인 확인 중이면 true

    // 로그인 페이지: login API 성공 후 받은 사용자 정보로 호출
    login: (userInfo) => setUser(userInfo),

    // 로그아웃: 서버 세션을 지우고 화면도 로그아웃 상태로
    logout: async () => {
      try {
        await logoutApi();
      } finally {
        setUser(null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

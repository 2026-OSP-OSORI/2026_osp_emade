// 로그인 상태 보관 — App.jsx 에서 앱 전체를 감싸고 있습니다.
// 로그인 방식: Flask 세션(쿠키)
//
// 앱이 켜질 때(새로고침 포함) GET /auth/me 로 로그인 상태를 확인합니다.
// 확인이 끝나기 전에는 isLoading 이 true 입니다.
//
// /auth/me 응답 (백1 API 명세 1번)
//   로그인:   data: { isLoggedIn: true,  uid: "-NxA8f2k..." }
//   로그아웃: data: { isLoggedIn: false, uid: null }
import { useEffect, useState } from "react";
import { getMe, logout as logoutApi } from "../api/auth";
import { AuthContext } from "../hooks/useAuth";

// /auth/me 응답(data)에서 uid 꺼내기 — 로그아웃 상태면 null
const toUid = (data) => (data?.isLoggedIn ? data.uid : null);

export default function AuthProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 앱이 켜질 때 한 번 로그인 상태 확인
  useEffect(() => {
    getMe()
      .then((data) => setUid(toUid(data)))
      .catch(() => setUid(null)) // 서버 꺼짐 등 → 로그아웃 상태로
      .finally(() => setIsLoading(false));
  }, []);

  // 서버에 로그인 상태를 다시 물어보기 (로그인 성공 후 호출)
  const refresh = async () => {
    try {
      setUid(toUid(await getMe()));
    } catch {
      setUid(null);
    }
  };

  const value = {
    uid, // 로그인한 사용자 ID (로그아웃 상태면 null) — 내 페이지·내 리뷰인지 판단할 때 사용
    isLoggedIn: Boolean(uid),
    isLoading, // 로그인 확인 중이면 true

    // 로그인 페이지: 로그인 API(/auth/login) 성공 후 호출
    //   로그인 API 는 사용자 정보를 주지 않아서(data: null), /auth/me 로 다시 확인합니다.
    refresh,

    // 로그아웃: 서버 세션을 지우고 화면도 로그아웃 상태로
    logout: async () => {
      try {
        await logoutApi();
      } catch {
        // 이미 로그아웃된 상태(401) 등은 무시
      } finally {
        setUid(null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

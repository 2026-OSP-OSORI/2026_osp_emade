// 로그인 상태 가져오기
// 사용법: const { uid, isLoggedIn, isLoading, refresh, logout } = useAuth();
//   uid       로그인한 사용자 ID (로그아웃 상태면 null)
//   isLoading 로그인 확인 중이면 true
//   refresh   로그인 성공 후 호출 (로그인 상태 다시 확인)
//   logout    로그아웃
import { createContext, useContext } from "react";

// 로그인 정보를 주고받는 통로 — AuthProvider 가 값을 넣고, useAuth 가 꺼냅니다.
export const AuthContext = createContext(null);

export default function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth)
    throw new Error("useAuth 는 AuthProvider 안에서만 사용할 수 있어요.");
  return auth;
}

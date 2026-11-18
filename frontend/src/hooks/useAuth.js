//로그인 상태 가져오기
// 사용법: const { user, isLoggedIn, isLoading, login, logout } = useAuth();
import { createContext, useContext } from "react";

// 로그인 정보를 주고받는 통로 — AuthProvider 가 값을 넣고, useAuth 가 꺼냅니다.
export const AuthContext = createContext(null);

export default function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth)
    throw new Error("useAuth 는 AuthProvider 안에서만 사용할 수 있어요.");
  return auth;
}

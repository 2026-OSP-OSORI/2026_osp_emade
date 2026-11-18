// 로그인이 필요한 동작(팔로우, 찜, 장바구니, 예약, 구매 등) 전에 로그인 여부 확인
// 로그인 안 했으면 → 로그인 페이지로 이동 (돌아올 주소를 state.from 에 담아 보냄)
// 로그인 했으면   → 넘겨준 동작 실행
//
// 사용법
//   const requireLogin = useRequireLogin();
//   <button onClick={() => requireLogin(() => addToCart(id))}>장바구니</button>
//
// 로그인 페이지에서는 로그인 성공 후 아래처럼 원래 페이지로 돌려보내면 됩니다.
//   const from = useLocation().state?.from ?? '/';
//   navigate(from, { replace: true });
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "./useAuth";

export default function useRequireLogin() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (action) => {
    if (isLoading) return; // 로그인 확인 중에는 아무것도 하지 않음 (잘못 로그인 페이지로 보내지 않도록)
    if (!isLoggedIn) {
      navigate("/login", {
        state: { from: location.pathname + location.search },
      });
      return;
    }
    action?.();
  };
}

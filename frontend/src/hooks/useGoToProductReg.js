// '상품 등록' 버튼용 — 주간 거래 시간을 정하지 않은 판매자는 등록 화면으로 가지 못하게 막기
//   (팀 결정: 주간 시간을 안 정한 판매자가 상품 등록을 누르면 alert 를 띄우고 막는다)
//
// 사용법 (마이페이지 '내가 등록한 상품' 등)
//   const goToProductReg = useGoToProductReg();
//   <button type="button" onClick={goToProductReg}>상품 등록</button>
//
// 상품 등록 화면(ProductReg)도 직접 주소로 들어오는 경우를 위해 같은 검사를 한 번 더 합니다.
import { useNavigate } from "react-router-dom";
import { getMySchedule, hasWeeklySchedule } from "../api/schedules";
import useRequireLogin from "./useRequireLogin";

export const NO_SCHEDULE_MESSAGE =
  "거래 가능한 주간 시간을 먼저 설정해 주세요.\n마이페이지 > 나의 거래 일정에서 설정할 수 있어요.";
export const SCHEDULE_PAGE = "/mypage/schedule";

export default function useGoToProductReg() {
  const navigate = useNavigate();
  const requireLogin = useRequireLogin();

  return () =>
    requireLogin(async () => {
      try {
        const schedule = await getMySchedule();
        if (!hasWeeklySchedule(schedule)) {
          alert(NO_SCHEDULE_MESSAGE);
          navigate(SCHEDULE_PAGE);
          return;
        }
      } catch {
        // 확인에 실패하면 등록 화면에서 다시 검사하므로 일단 이동
      }
      navigate("/products/new");
    });
}

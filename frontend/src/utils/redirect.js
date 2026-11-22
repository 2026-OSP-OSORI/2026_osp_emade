// 로그인 후 돌아갈 주소 정리
//   useRequireLogin 이 state.from 에 담아 보낸 주소만 사용하고,
//   외부 주소("//evil.com")나 로그인/회원가입 화면으로는 돌려보내지 않습니다.
const AUTH_PAGES = ["/login", "/signup"];

export const getRedirectPath = (from) => {
  if (typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//")) return "/";
  if (AUTH_PAGES.some((page) => from === page || from.startsWith(`${page}?`))) return "/";
  return from;
};

// 로그인 / 회원가입 입력 검사
// 백엔드(backend/services/user_service.py)와 같은 규칙·문구를 씁니다.

// 이화여대 이메일 도메인 — 백엔드 ALLOWED_DOMAINS 와 같게 유지
export const ALLOWED_EMAIL_DOMAINS = ["ewha.ac.kr", "ewhain.net"];
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 백엔드와 같은 정리: 앞뒤 공백 제거 + 소문자
export const cleanEmail = (email) => (email ?? "").trim().toLowerCase();

// 이메일 형식·도메인 검사 → 문제가 있으면 에러 문구, 없으면 ""
export const validateEmail = (email) => {
  const value = cleanEmail(email);
  if (!value) return "*이메일을 입력하세요.";
  if (!EMAIL_PATTERN.test(value)) return "*올바른 이메일 형식이 아닙니다.";
  if (!ALLOWED_EMAIL_DOMAINS.includes(value.split("@")[1])) {
    return "*이화여대 이메일 형식으로 입력하세요.";
  }
  return "";
};

export const validateNickname = (nickname) =>
  (nickname ?? "").trim() ? "" : "*닉네임을 입력하세요.";

export const validatePassword = (password) =>
  (password ?? "").length >= MIN_PASSWORD_LENGTH
    ? ""
    : `*비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 입력하세요.`;

export const validatePasswordConfirm = (password, confirm) =>
  password === confirm ? "" : "*비밀번호가 일치하지 않습니다.";

// API 에러를 화면 문구로
//   백엔드 에러 문구는 이미 "*..." 형태라 그대로 쓰고,
//   서버가 꺼져 있는 등 응답이 없으면 공통 문구를 보여줍니다.
export const toErrorMessage = (error) => {
  if (!error) return "";
  if (error.code || (error.status && error.status < 500)) {
    return error.message?.startsWith("*") ? error.message : `*${error.message}`;
  }
  return "*서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
};

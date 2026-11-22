// 로그인 — 원본: login.html / Figma 로그인 (비활성화 · 활성화 · 에러)
//
// 상태
//   비활성화  이메일·비밀번호 중 하나라도 비어 있거나 전송 중이면 버튼 회색
//   활성화    두 칸 모두 입력되면 버튼 초록
//   에러      로그인 실패 시 비밀번호 칸 아래 빨간 문구 (서버 문구 그대로)
//
// 흐름
//   POST /auth/login 성공 → Flask 가 세션 쿠키를 심어 줌
//   → refresh() 로 /auth/me 를 다시 물어 로그인 상태 확인
//   → 원래 가려던 페이지(state.from)로 이동, 없으면 메인
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../../api/auth";
import useAuth from "../../hooks/useAuth";
import { cleanEmail, toErrorMessage } from "../../utils/validation";
import AuthField from "./components/AuthField";
import { getRedirectPath } from "./redirect";
import styles from "./Auth.module.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, isLoading, refresh } = useAuth();

  const redirectTo = getRedirectPath(location.state?.from);
  const justSignedUp = Boolean(location.state?.signedUp);

  // 회원가입 직후에는 가입한 이메일을 미리 채워 둠
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // 처음 들어왔을 때 비어 있는 칸에 커서
  useEffect(() => {
    (emailRef.current?.value ? passwordRef : emailRef).current?.focus();
  }, []);

  // 이미 로그인한 상태로 /login 에 들어오면 돌려보내기
  useEffect(() => {
    if (!isLoading && isLoggedIn && !submitting) {
      navigate(redirectTo, { replace: true });
    }
  }, [isLoading, isLoggedIn, submitting, navigate, redirectTo]);

  const canSubmit = email.trim() !== "" && password !== "" && !submitting;

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setError(""); // 다시 입력하면 에러 문구 지우기
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return; // Enter 연타·빈 칸 전송 막기

    setSubmitting(true);
    setError("");

    try {
      await login({ email: cleanEmail(email), password });

      // 로그인 API 는 사용자 정보를 주지 않아서 /auth/me 로 다시 확인
      const ok = await refresh();
      if (!ok) {
        // 로그인은 성공했는데 쿠키가 저장되지 않은 경우 (프록시·쿠키 설정 문제 등)
        setError("*로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.");
        setSubmitting(false);
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(toErrorMessage(err));
      setSubmitting(false);
      passwordRef.current?.select(); // 비밀번호를 바로 다시 입력할 수 있게
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>
        <h1 className={styles.title}>로그인</h1>

        {justSignedUp && (
          <p className={styles.notice} role="status">
            회원가입이 완료되었어요. 로그인해 주세요.
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <AuthField
            id="login-email"
            inputRef={emailRef}
            type="email"
            name="email"
            placeholder="이화계정 이메일을 입력하세요."
            autoComplete="username"
            value={email}
            onChange={handleEmailChange}
            aria-label="이메일"
          />
          <AuthField
            id="login-password"
            inputRef={passwordRef}
            type="password"
            name="password"
            placeholder="비밀번호를 입력하세요."
            autoComplete="current-password"
            value={password}
            onChange={handlePasswordChange}
            aria-label="비밀번호"
          />

          <p className={styles.formError} role="alert">
            {error}
          </p>

          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className={styles.switch}>
          아직 회원이 아니신가요?
          <Link to="/signup" state={{ from: location.state?.from }}>
            회원가입
          </Link>
        </p>
      </main>
    </div>
  );
}

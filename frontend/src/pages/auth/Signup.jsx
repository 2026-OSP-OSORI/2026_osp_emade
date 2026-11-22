// 회원가입 — 원본: signup.html / Figma 회원가입 (비활성화 · 활성화 · 에러 4종)
//
// 상태
//   비활성화  네 칸 중 하나라도 비어 있거나 전송 중이면 버튼 회색
//   활성화    네 칸 모두 입력되면 버튼 초록 (검사는 버튼을 눌렀을 때 한 번 더)
//   에러      칸마다 아래에 빨간 문구
//     - 닉네임  *이미 사용 중인 닉네임입니다.
//     - 이메일  *이화여대 이메일 형식으로 입력하세요. / *이미 사용 중인 이메일입니다.
//     - 비밀번호 *비밀번호는 8자 이상 입력하세요.
//     - 확인    *비밀번호가 일치하지 않습니다.
//
// 중복 확인
//   닉네임·이메일은 '중복 확인'을 통과해야 가입할 수 있습니다.
//   확인한 뒤 내용을 바꾸면 다시 확인해야 합니다.
//   (서버도 가입할 때 한 번 더 검사하므로, 그 사이 누가 먼저 가입해도 안전합니다)
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { checkEmail, checkNickname, signup } from "../../api/auth";
import useAuth from "../../hooks/useAuth";
import {
  cleanEmail,
  toErrorMessage,
  validateEmail,
  validateNickname,
  validatePassword,
  validatePasswordConfirm,
} from "../../utils/validation";
import AuthField from "./components/AuthField";
import styles from "./Auth.module.css";

// 칸별 문구: { text, error }  error=false 면 초록(통과) 문구
const EMPTY = { text: "", error: true };
const fail = (text) => ({ text, error: true });
const pass = (text) => ({ text, error: false });

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, isLoading } = useAuth();

  const [form, setForm] = useState({
    nickname: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [messages, setMessages] = useState({
    nickname: EMPTY,
    email: EMPTY,
    password: EMPTY,
    passwordConfirm: EMPTY,
  });

  // 중복 확인을 통과한 값 — 지금 입력값과 같아야 통과로 인정
  const [checked, setChecked] = useState({ nickname: null, email: null });
  const [checking, setChecking] = useState({ nickname: false, email: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // 이미 로그인했다면 메인으로
  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate("/", { replace: true });
  }, [isLoading, isLoggedIn, navigate]);

  const setMessage = (field, message) =>
    setMessages((prev) => ({ ...prev, [field]: message }));

  const nicknameValue = form.nickname.trim();
  const emailValue = cleanEmail(form.email);
  const isNicknameChecked = checked.nickname !== null && checked.nickname === nicknameValue;
  const isEmailChecked = checked.email !== null && checked.email === emailValue;

  const allFilled = Object.values(form).every((value) => value !== "");
  const canSubmit = allFilled && !submitting;

  // ---------- 입력 ----------
  const handleChange = (field) => (e) => {
    const value = e.target.value;
    const next = { ...form, [field]: value };
    setForm(next);
    setFormError("");

    // 닉네임·이메일을 바꾸면 중복 확인 결과는 무효 → 문구 지우기
    if (field === "nickname" || field === "email") {
      setMessage(field, EMPTY);
    }

    // 비밀번호 칸: 에러가 떠 있을 때만 입력하면서 바로 다시 검사 (고치면 즉시 사라지게)
    if (field === "password" && messages.password.text) {
      setMessage("password", fail(validatePassword(value)));
    }
    if ((field === "password" || field === "passwordConfirm") && messages.passwordConfirm.text) {
      setMessage(
        "passwordConfirm",
        fail(validatePasswordConfirm(next.password, next.passwordConfirm)),
      );
    }
  };

  // 칸에서 나갈 때 검사 (Figma 에러 화면처럼 입력 후 바로 알려 주기)
  const handleBlur = (field) => () => {
    if (field === "password" && form.password) {
      setMessage("password", fail(validatePassword(form.password)));
    }
    if (field === "passwordConfirm" && form.passwordConfirm) {
      setMessage(
        "passwordConfirm",
        fail(validatePasswordConfirm(form.password, form.passwordConfirm)),
      );
    }
    if (field === "email" && form.email && !isEmailChecked) {
      // 형식만 미리 알려 주고, 중복 여부는 '중복 확인' 버튼에서
      const formatError = validateEmail(form.email);
      if (formatError) setMessage("email", fail(formatError));
    }
  };

  // ---------- 중복 확인 ----------
  const runCheck = async (field) => {
    const isNickname = field === "nickname";
    const value = isNickname ? nicknameValue : emailValue;
    const inputError = isNickname ? validateNickname(form.nickname) : validateEmail(form.email);

    if (inputError) {
      setMessage(field, fail(inputError));
      return;
    }

    setChecking((prev) => ({ ...prev, [field]: true }));
    try {
      await (isNickname ? checkNickname(value) : checkEmail(value));
      setChecked((prev) => ({ ...prev, [field]: value }));
      setMessage(
        field,
        pass(isNickname ? "*사용 가능한 닉네임입니다." : "*사용 가능한 이메일입니다."),
      );
    } catch (err) {
      setChecked((prev) => ({ ...prev, [field]: null }));
      setMessage(field, fail(toErrorMessage(err)));
    } finally {
      setChecking((prev) => ({ ...prev, [field]: false }));
    }
  };

  // ---------- 가입 ----------
  // 모든 칸 검사 → 문구 표시, 통과하면 true
  const validateAll = () => {
    const next = {
      nickname: validateNickname(form.nickname)
        ? fail(validateNickname(form.nickname))
        : isNicknameChecked
          ? messages.nickname
          : fail("*닉네임 중복 확인을 해주세요."),
      email: validateEmail(form.email)
        ? fail(validateEmail(form.email))
        : isEmailChecked
          ? messages.email
          : fail("*이메일 중복 확인을 해주세요."),
      password: fail(validatePassword(form.password)),
      passwordConfirm: fail(validatePasswordConfirm(form.password, form.passwordConfirm)),
    };
    setMessages(next);
    return Object.values(next).every((message) => !message.text || !message.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setFormError("");
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      await signup({ nickname: nicknameValue, email: emailValue, password: form.password });

      // 가입 완료 → 로그인 화면으로 (이메일 미리 채우기, 원래 가려던 페이지 유지)
      navigate("/login", {
        replace: true,
        state: { signedUp: true, email: emailValue, from: location.state?.from },
      });
    } catch (err) {
      // 서버 에러를 해당 칸에 표시 (확인 후 그 사이 다른 사람이 가입한 경우 등)
      const message = fail(toErrorMessage(err));
      if (err.code === "NICKNAME_ALREADY_EXISTS") {
        setChecked((prev) => ({ ...prev, nickname: null }));
        setMessage("nickname", message);
      } else if (err.code?.startsWith("EMAIL_") || err.code?.startsWith("INVALID_EMAIL")) {
        setChecked((prev) => ({ ...prev, email: null }));
        setMessage("email", message);
      } else {
        setFormError(message.text);
      }
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>
        <h1 className={styles.title}>회원가입</h1>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <AuthField
            id="signup-nickname"
            type="text"
            name="nickname"
            placeholder="닉네임을 입력하세요."
            autoComplete="nickname"
            aria-label="닉네임"
            value={form.nickname}
            onChange={handleChange("nickname")}
            onCheck={() => runCheck("nickname")}
            checking={checking.nickname}
            message={messages.nickname.text}
            error={messages.nickname.error}
          />
          <AuthField
            id="signup-email"
            type="email"
            name="email"
            placeholder="이화 계정 이메일을 입력하세요."
            autoComplete="email"
            aria-label="이메일"
            value={form.email}
            onChange={handleChange("email")}
            onBlur={handleBlur("email")}
            onCheck={() => runCheck("email")}
            checking={checking.email}
            message={messages.email.text}
            error={messages.email.error}
          />
          <AuthField
            id="signup-password"
            type="password"
            name="password"
            placeholder="비밀번호를 입력하세요."
            autoComplete="new-password"
            aria-label="비밀번호"
            value={form.password}
            onChange={handleChange("password")}
            onBlur={handleBlur("password")}
            message={messages.password.text}
          />
          <AuthField
            id="signup-password-confirm"
            type="password"
            name="passwordConfirm"
            placeholder="비밀번호를 다시 입력하세요."
            autoComplete="new-password"
            aria-label="비밀번호 확인"
            value={form.passwordConfirm}
            onChange={handleChange("passwordConfirm")}
            onBlur={handleBlur("passwordConfirm")}
            message={messages.passwordConfirm.text}
          />

          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <button type="submit" className={styles.submit} disabled={!canSubmit}>
            {submitting ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className={styles.switch}>
          이미 회원이신가요?
          <Link to="/login" state={{ from: location.state?.from }}>
            로그인
          </Link>
        </p>
      </main>
    </div>
  );
}

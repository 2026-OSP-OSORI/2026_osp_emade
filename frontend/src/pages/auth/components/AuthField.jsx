// 로그인 · 회원가입 입력칸 한 줄
//   - message: 칸 아래 문구 (error=true 면 빨강, false 면 초록)
//   - onCheck: 넘기면 칸 오른쪽에 '중복 확인' 버튼이 생깁니다.
import styles from "../Auth.module.css";

export default function AuthField({
  id,
  message = "",
  error = true,
  onCheck,
  checking = false,
  inputRef,
  ...inputProps
}) {
  const messageId = message ? `${id}-message` : undefined;

  const inputClass = [
    styles.input,
    onCheck ? styles.withButton : "",
    message && error ? styles.invalid : "",
  ].join(" ");

  return (
    <div className={styles.field}>
      <div className={styles.inputWrap}>
        <input
          id={id}
          ref={inputRef}
          className={inputClass}
          aria-invalid={Boolean(message && error)}
          aria-describedby={messageId}
          {...inputProps}
        />
        {onCheck && (
          <button
            type="button"
            className={styles.checkButton}
            onClick={onCheck}
            disabled={checking}
          >
            {checking ? "확인 중" : "중복 확인"}
          </button>
        )}
      </div>

      {message && (
        <p
          id={messageId}
          className={`${styles.message} ${error ? styles.error : styles.success}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </div>
  );
}

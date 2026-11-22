// 도움돼요 버튼 — 누르면 바로 숫자가 바뀌고, 저장에 실패하면 되돌립니다.
//   로그인하지 않았으면 로그인 화면으로 이동합니다.
//   <HelpfulButton rid={rid} count={10} isHelpful={false} size="lg" />
import { useState } from "react";
import { addHelpful, removeHelpful } from "../../../api/reviews";
import useRequireLogin from "../../../hooks/useRequireLogin";
import thumbIcon from "../../../assets/svg/thumb-up.svg";
import styles from "./HelpfulButton.module.css";

export default function HelpfulButton({ rid, count = 0, isHelpful = false, size = "md", disabled = false }) {
  const [state, setState] = useState({ count, active: isHelpful });
  const [saving, setSaving] = useState(false);
  const requireLogin = useRequireLogin();

  const toggle = () =>
    requireLogin(async () => {
      if (saving) return;
      const prev = state;
      const nextActive = !prev.active;
      setState({ active: nextActive, count: Math.max(0, prev.count + (nextActive ? 1 : -1)) });
      setSaving(true);
      try {
        await (nextActive ? addHelpful(rid) : removeHelpful(rid));
      } catch {
        setState(prev); // 실패하면 원래대로
      } finally {
        setSaving(false);
      }
    });

  return (
    <button
      type="button"
      className={`${styles.button} ${styles[size]} ${state.active ? styles.active : ""}`}
      onClick={toggle}
      aria-pressed={state.active}
      disabled={disabled}
    >
      <img src={thumbIcon} alt="" />
      도움돼요
      <span className={styles.count}>{state.count}</span>
    </button>
  );
}

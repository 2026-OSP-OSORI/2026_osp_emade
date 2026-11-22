// 판매자 답글 영역 (Figma 리뷰 상세 4가지 화면)
//   1. 답글 있음            → 노란 박스로 답글 표시 (누구에게나)
//   2. 답글 없음 + 판매자   → '답글 등록하기' 버튼
//   3. 버튼 누름            → 입력칸 + 취소 / 답글 확정하기
//   4. 답글 없음 + 판매자 아님 → 아무것도 표시하지 않음
import { useState } from "react";
import { addSellerReply } from "../../../api/reviews";
import { formatDate } from "../../../utils/format";
import { toErrorMessage } from "../../../utils/validation";
import styles from "./SellerReply.module.css";

export default function SellerReply({ rid, reply, repliedAt, isSeller, onReplied }) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 1. 답글 있음
  if (reply) {
    return (
      <div className={styles.reply}>
        <p className={styles.head}>
          <strong>판매자 답글</strong>
          <span>{formatDate(repliedAt)}</span>
        </p>
        <p className={styles.text}>{reply}</p>
      </div>
    );
  }

  // 4. 판매자가 아니면 표시 안 함
  if (!isSeller) return null;

  // 2. 답글 등록하기 버튼
  if (!writing) {
    return (
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => setWriting(true)}>
          답글 등록하기
        </button>
      </div>
    );
  }

  // 3. 답글 입력
  const submit = async () => {
    const content = text.trim();
    if (!content) {
      setError("*답글 내용을 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await addSellerReply(rid, content);
      onReplied?.(content, data?.sellerRepliedAt);
    } catch (err) {
      setError(toErrorMessage(err));
      setSaving(false);
    }
  };

  const cancel = () => {
    setWriting(false);
    setText("");
    setError("");
  };

  return (
    <div className={styles.form}>
      <textarea
        className={styles.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예) 소중한 후기 감사해요! 다음에도 정성껏 만들게요 :)"
        aria-label="판매자 답글"
        maxLength={500}
        autoFocus
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.gray} onClick={cancel} disabled={saving}>
          취소
        </button>
        <button type="button" className={styles.primary} onClick={submit} disabled={saving}>
          {saving ? "등록 중..." : "답글 확정하기"}
        </button>
      </div>
    </div>
  );
}

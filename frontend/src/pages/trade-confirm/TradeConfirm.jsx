// 거래 확정 — 원본: trade-confirm.html / Figma 거래확정
//   주소: /trade-confirm/:id  (id = 주문 oid)
//
//   들어오면 먼저 거래 내역 확인서(GET /orders/{oid})로 지금 상태를 확인합니다.
//     - actions.canComplete = true  → '거래 완료' 버튼 사용 가능 (거래 시각 ~ +24시간)
//     - 거래 시각 전(UPCOMING)       → 아직 확정할 수 없다고 안내
//     - 이미 완료 / 취소 / 실패        → 결과 안내
//   '거래 완료' → PATCH /orders/{oid}/complete
//   '거래 미성사' → 명세에 미성사 API 가 없어서 서버에는 보내지 않고 거래 내역 확인서로 이동합니다.
//                   (아무도 확정하지 않으면 거래 시각 24시간 뒤 서버가 '거래 실패'로 처리)
//   로그인이 필요한 화면이라, 로그인하지 않았으면 로그인 후 다시 이 화면으로 돌아옵니다.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { completeTrade, getOrder } from "../../api/orders";
import useAuth from "../../hooks/useAuth";
import { toErrorMessage } from "../../utils/validation";
import styles from "./TradeConfirm.module.css";

// 화면에 보여 줄 상태 정하기
//   ready: 확정 가능 / upcoming: 거래 시각 전 / done: 완료 / closed: 취소·실패
const toView = (order) => {
  if (order.status === "COMPLETED" || order.displayStatus === "COMPLETED") return "done";
  if (order.actions?.canComplete) return "ready";
  if (order.displayStatus === "UPCOMING") return "upcoming";
  return "closed";
};

// "2026-11-03T11:00:00+09:00" → "11/3 (화) 11:00"
const formatTradeTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = "일월화수목금토"[date.getDay()];
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}/${date.getDate()} (${day}) ${time}`;
};

const TEXT = {
  ready: { title: "거래가 완료되었나요?", desc: "거래 완료를 눌러 거래를 확정해보세요" },
  done: { title: "거래가 완료되었어요", desc: "거래 물품에 대한 리뷰를 남겨 주세요." },
  closed: { title: "확정할 수 없는 거래예요", desc: "취소되었거나 확정 기한이 지난 거래예요." },
};

export default function TradeConfirm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isLoggedIn, isLoading } = useAuth();

  // 불러온 주문을 어떤 id 의 것인지와 함께 보관
  const [result, setResult] = useState({ id: null, order: null, error: "" });
  const [completedNow, setCompletedNow] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // 로그인 안 했으면 로그인 화면으로 (로그인 후 다시 여기로)
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate("/login", { replace: true, state: { from: pathname } });
    }
  }, [isLoading, isLoggedIn, navigate, pathname]);

  // 주문 상태 불러오기
  useEffect(() => {
    if (!isLoggedIn) return;
    let ignore = false;
    getOrder(id)
      .then((order) => !ignore && setResult({ id, order, error: "" }))
      .catch((err) => !ignore && setResult({ id, order: null, error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [id, isLoggedIn]);

  const handleComplete = async () => {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      await completeTrade(id);
      setCompletedNow(true);
    } catch (err) {
      // 상대방이 먼저 눌렀으면 이미 완료된 것 → 완료 화면으로
      if (err.code === "ORDER_ALREADY_COMPLETED") setCompletedNow(true);
      else setError(toErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  // 미성사: 서버에 보내지 않고 거래 내역 확인서로 (위 설명 참고)
  const handleFail = () => navigate(`/mypage/history/${id}`);

  if (isLoading || !isLoggedIn) return null; // 로그인 확인 중에는 빈 화면

  const isCurrent = result.id === id;
  const order = isCurrent ? result.order : null;
  const loadError = isCurrent ? result.error : "";
  const view = completedNow ? "done" : order ? toView(order) : null;

  const text =
    view === "upcoming"
      ? {
          title: "아직 거래 시각 전이에요",
          desc: `${formatTradeTime(order.tradeStartAt)} 이후에 거래를 확정할 수 있어요.`,
        }
      : TEXT[view];

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>
        <p className={styles.label}>거래확정</p>

        {loadError ? (
          <p className={`${styles.desc} ${styles.loadMessage}`} role="alert">
            {loadError}
          </p>
        ) : !view ? (
          <p className={`${styles.desc} ${styles.loadMessage}`}>거래 정보를 불러오는 중이에요.</p>
        ) : (
          <>
            {order?.productName && <p className={styles.product}>{order.productName}</p>}
            <h1 className={styles.title}>{text.title}</h1>
            <p className={styles.desc}>{text.desc}</p>

            <div className={styles.actions}>
              {view === "ready" ? (
                <>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.primary}`}
                    onClick={handleComplete}
                    disabled={sending}
                  >
                    {sending ? "처리 중..." : "거래 완료"}
                  </button>
                  <button type="button" className={styles.button} onClick={handleFail} disabled={sending}>
                    거래 미성사
                  </button>
                </>
              ) : (
                <Link to={`/mypage/history/${id}`} className={styles.button}>
                  거래 내역 보기
                </Link>
              )}
            </div>
          </>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {/* 리뷰는 거래가 완료된 주문만 쓸 수 있음 */}
        {view === "done" && (
          <Link to={`/reviews/new?oid=${encodeURIComponent(id)}`} className={styles.reviewLink}>
            거래 물품에 대한 리뷰를 작성해보세요!
          </Link>
        )}
      </main>
    </div>
  );
}

// 거래 시간 선택 팝오버 — 원본: product-detail.html 의 .time-popover
//   달력에서 예약 가능한 날(파랑)을 고르고 → 30분 단위 시간 중 하나를 고르면 됩니다.
//   <TradeTimePicker pid={pid} value={tradeKey} onDone={(tradeKey) => ...} />
//   inline: 팝오버 대신 그 자리에 그대로 (장바구니 일정 수정 모달)
//
// API (백3 스케줄)
//   GET /products/{pid}/available-dates?month=2026-11  → dates: [{ date, hasOpenBlock }]
//   GET /products/{pid}/available-blocks?date=2026-11-16 → blocks: [{ tradeKey, startTime, state }]
//   예약은 오늘부터 30일 안에서만 가능해서 이번 달 ~ 다음 달만 넘길 수 있어요.
import { useEffect, useState } from "react";
import { getAvailableBlocks, getAvailableDates } from "../../../api/products";
import { toErrorMessage } from "../../../utils/validation";
import chevronIcon from "../../../assets/svg/chevron-right.svg";
import styles from "./TradeTimePicker.module.css";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n) => String(n).padStart(2, "0");
const toMonthKey = (year, month) => `${year}-${pad(month)}`; // month: 1~12

// "2026-11-16" → "11월 16일 (월)"
const dateLabel = (date) => {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
};

// tradeKey "20261116_1400" → "2026-11-16"
const tradeKeyDate = (tradeKey) =>
  tradeKey ? `${tradeKey.slice(0, 4)}-${tradeKey.slice(4, 6)}-${tradeKey.slice(6, 8)}` : "";

export default function TradeTimePicker({ pid, value, onDone, inline = false }) {
  // 이번 달 (예약은 이번 달 ~ 다음 달만)
  const [firstMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [view, setView] = useState(() => {
    const d = tradeKeyDate(value);
    return d ? { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) } : firstMonth;
  });
  const monthKey = toMonthKey(view.year, view.month);
  const isFirstMonth = view.year === firstMonth.year && view.month === firstMonth.month;

  const [dates, setDates] = useState({ key: null, open: new Set(), error: "" });
  const [date, setDate] = useState(tradeKeyDate(value));
  const [blocks, setBlocks] = useState({ key: null, list: [], error: "" });
  const [tradeKey, setTradeKey] = useState(value ?? "");

  // 달이 바뀌면 예약 가능한 날짜 다시 불러오기
  useEffect(() => {
    let ignore = false;
    getAvailableDates(pid, monthKey)
      .then((data) => {
        if (ignore) return;
        const open = new Set((data?.dates ?? []).filter((d) => d.hasOpenBlock).map((d) => d.date));
        setDates({ key: monthKey, open, error: "" });
      })
      .catch((err) => !ignore && setDates({ key: monthKey, open: new Set(), error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [pid, monthKey]);

  // 날짜를 고르면 그 날의 30분 칸 불러오기
  useEffect(() => {
    if (!date) return;
    let ignore = false;
    getAvailableBlocks(pid, date)
      .then((data) => !ignore && setBlocks({ key: date, list: data?.blocks ?? [], error: "" }))
      .catch((err) => !ignore && setBlocks({ key: date, list: [], error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [pid, date]);

  const moveMonth = (diff) =>
    setView(({ year, month }) => {
      const next = new Date(year, month - 1 + diff, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });

  // 달력 칸: 1일 앞 빈칸 + 날짜들
  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const dayCount = new Date(view.year, view.month, 0).getDate();
  const days = Array.from({ length: dayCount }, (_, i) => `${monthKey}-${pad(i + 1)}`);

  const blockList = blocks.key === date ? blocks.list : [];
  const selectedBlock = blockList.find((b) => b.tradeKey === tradeKey);

  return (
    <div
      className={`${styles.popover} ${inline ? styles.inline : ""}`}
      role={inline ? "group" : "dialog"}
      aria-label="거래 시간 선택"
    >
      <p className={styles.title}>거래 날짜</p>
      <div className={styles.month}>
        <button
          type="button"
          className={`${styles.nav} ${styles.prev}`}
          onClick={() => moveMonth(-1)}
          disabled={isFirstMonth}
          aria-label="이전 달"
        >
          <img src={chevronIcon} alt="" />
        </button>
        <strong>
          {view.year}년 {view.month}월
        </strong>
        <button
          type="button"
          className={styles.nav}
          onClick={() => moveMonth(1)}
          disabled={!isFirstMonth}
          aria-label="다음 달"
        >
          <img src={chevronIcon} alt="" />
        </button>
      </div>

      <div className={styles.week}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? styles.sun : i === 6 ? styles.sat : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className={`${styles.days} ${dates.key !== monthKey ? styles.loading : ""}`}>
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((d) => {
          const available = dates.key === monthKey && dates.open.has(d);
          const label = Number(d.slice(8));
          return available ? (
            <button
              key={d}
              type="button"
              className={`${styles.day} ${styles.available} ${d === date ? styles.selected : ""}`}
              onClick={() => {
                setDate(d);
                setTradeKey("");
              }}
              aria-pressed={d === date}
            >
              {label}
            </button>
          ) : (
            <span key={d} className={styles.day}>
              {label}
            </span>
          );
        })}
      </div>
      {dates.error && <p className={styles.error}>{dates.error}</p>}
      <div className={styles.legend}>
        <span className={styles.legendItem}>예약 가능</span>
        <span className={`${styles.legendItem} ${styles.legendSelected}`}>선택한 날</span>
      </div>

      <hr className={styles.line} />

      <p className={styles.title}>거래 시간</p>
      {date ? (
        <>
          <div className={styles.head}>
            <strong>{dateLabel(date)}</strong>
            <span>30분 단위 · 회색은 마감</span>
          </div>
          {blocks.error && blocks.key === date && <p className={styles.error}>{blocks.error}</p>}
          <div className={styles.slots}>
            {blockList.map((b) =>
              b.state === "OPEN" ? (
                <button
                  key={b.tradeKey}
                  type="button"
                  className={`${styles.slot} ${b.tradeKey === tradeKey ? styles.slotSelected : ""}`}
                  onClick={() => setTradeKey(b.tradeKey)}
                  aria-pressed={b.tradeKey === tradeKey}
                >
                  {b.startTime}
                </button>
              ) : (
                <span key={b.tradeKey} className={`${styles.slot} ${styles.closed}`}>
                  {b.startTime}
                </span>
              ),
            )}
          </div>
        </>
      ) : (
        <p className={styles.hint}>먼저 날짜를 골라 주세요.</p>
      )}

      <div className={styles.foot}>
        <span>{selectedBlock ? `${dateLabel(date)} ${selectedBlock.startTime} 선택됨` : ""}</span>
        <button
          type="button"
          className={styles.done}
          disabled={!selectedBlock}
          onClick={() => onDone(tradeKey)}
        >
          선택 완료
        </button>
      </div>
    </div>
  );
}

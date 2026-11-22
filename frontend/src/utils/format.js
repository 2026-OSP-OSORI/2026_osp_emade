// 화면에 보여줄 값 모양 맞추기

// 12000 → "12,000원"
export const formatPrice = (price) => `${Number(price ?? 0).toLocaleString()}원`;

// "2026-10-08T14:00:00+09:00" → "2026.10.08"
export const formatDate = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
};

// 리뷰 작성자 닉네임 일부 가리기 (Figma: minji**)
//   "minji12" → "minji**", "공대" → "공*"
export const maskNickname = (nickname) => {
  const text = String(nickname ?? "");
  if (text.length <= 1) return text;
  const visible = Math.max(1, text.length - 2);
  return text.slice(0, visible) + "*".repeat(text.length - visible);
};

// 4.2 → "4.2", 5 → "5.0"
export const formatRating = (rating) => Number(rating ?? 0).toFixed(1);

// 거래 일시 "2026-11-03T12:00:00+09:00" → "11/3(월) 12:00"
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const formatTradeTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// tradeKey "20261103_1200" → "11/3(월) 12:00"  (장바구니·상세에서 고른 시간 표시)
export const formatTradeKey = (tradeKey) => {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/.exec(tradeKey ?? "");
  if (!m) return "";
  return formatTradeTime(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`);
};

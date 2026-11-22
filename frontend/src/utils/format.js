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

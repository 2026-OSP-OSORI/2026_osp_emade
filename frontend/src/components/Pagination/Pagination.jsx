import styles from "./Pagination.module.css";

/** Controlled, reusable pagination; parent owns the page and fetches data. */
export default function Pagination({ currentPage = 1, totalPages = 1, onPageChange, siblingCount = 1 }) {
  const total = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.min(total, Math.max(1, Math.floor(Number(currentPage) || 1)));
  const sibling = Math.max(0, Math.floor(Number(siblingCount) || 0));
  if (total <= 1) return null;

  const pages = [];
  const visible = new Set([1, total]);
  for (let page = Math.max(1, current - sibling); page <= Math.min(total, current + sibling); page++) visible.add(page);
  const sorted = [...visible].sort((a, b) => a - b);
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) {
      if (page - sorted[index - 1] === 2) pages.push(sorted[index - 1] + 1);
      else pages.push(`ellipsis-${index}`);
    }
    pages.push(page);
  });

  const change = (page) => {
    if (page !== current && page >= 1 && page <= total) onPageChange?.(page);
  };

  return (
    <nav className={styles.pagination} aria-label="페이지 이동">
      <button type="button" className={styles.arrow} disabled={current === 1} aria-label="이전 페이지" onClick={() => change(current - 1)}>‹</button>
      {pages.map((page) => typeof page === "number" ? (
        <button key={page} type="button" className={`${styles.page} ${page === current ? styles.active : ""}`} aria-label={`${page}페이지`} aria-current={page === current ? "page" : undefined} onClick={() => change(page)}>{page}</button>
      ) : <span key={page} className={styles.ellipsis} aria-hidden="true">…</span>)}
      <button type="button" className={styles.arrow} disabled={current === total} aria-label="다음 페이지" onClick={() => change(current + 1)}>›</button>
    </nav>
  );
}

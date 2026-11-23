// 상품 목록 · 검색 결과 — 원본: product-list.html / Figma 상품 목록   (담당: 유나)
//   주소: /products                 전체 상품
//         /products?category=뜨개질  카테고리 (헤더 카테고리 메뉴)
//         /products?q=검색어         검색 결과 (헤더 검색창)
//   필터 조건은 주소(?category=&price=)에 담아서 뒤로 가기·새로고침해도 유지됩니다.
//
// API: GET /products?query=&category=&sort=newest&cursor=&limit=  → { items, nextCursor }
//   - 명세가 커서 방식이라 지나간 페이지 커서를 기억해서 번호로 이동합니다 (hooks/useProductList).
//   - 명세에 가격 필터가 없어서 가격대는 불러온 상품 중에서 화면에서 거릅니다.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "../../components/Card/Card";
import Pagination from "../../components/Pagination/Pagination";
import { CATEGORIES, CATEGORY_CODES } from "../../constants/categories";
import { useProductPages } from "../../hooks/useProductList";
import styles from "./ProductList.module.css";

const PAGE_SIZE = 20;

// 가격대 (원) — [최소, 최대]
const PRICE_RANGES = [
  { value: "under1", label: "1만원 이하", range: [0, 10000] },
  { value: "1to3", label: "1만원 ~ 3만원", range: [10000, 30000] },
  { value: "3to5", label: "3만원 ~ 5만원", range: [30000, 50000] },
  { value: "over5", label: "5만원 이상", range: [50000, Infinity] },
];

const toNumber = (text) => {
  const n = Number(String(text ?? "").replace(/[^\d]/g, ""));
  return text === "" || text == null || Number.isNaN(n) ? null : n;
};

export default function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";
  const price = searchParams.get("price") ?? "";
  const min = toNumber(searchParams.get("min"));
  const max = toNumber(searchParams.get("max"));

  // 직접 입력 칸 (Enter·포커스 아웃 때 주소에 반영)
  const [minText, setMinText] = useState(searchParams.get("min") ?? "");
  const [maxText, setMaxText] = useState(searchParams.get("max") ?? "");

  const { products, loading, error, page, totalPages, setPage } = useProductPages(
    { query: q, category: CATEGORY_CODES[category], sort: "newest" },
    PAGE_SIZE,
  );

  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === "" || value == null) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next);
  };

  // 가격 필터 (화면에서 거르기)
  const presetRange = PRICE_RANGES.find((r) => r.value === price)?.range;
  const [low, high] = presetRange ?? [min ?? 0, max ?? Infinity];
  const visible = products.filter((p) => {
    const value = Number(p.price) || 0;
    return value >= low && value <= high;
  });

  const applyCustomPrice = () =>
    updateParams({ price: "", min: toNumber(minText) ?? "", max: toNumber(maxText) ?? "" });

  const title = q ? `'${q}' 검색 결과` : category || "전체상품";

  return (
    <div className={styles.page}>
      {/* ===== 필터 (왼쪽) ===== */}
      <aside className={styles.filter}>
        <section className={styles.group}>
          <h2 className={styles.groupTitle}>카테고리</h2>
          <ul className={styles.checkList}>
            <li>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={!category}
                  onChange={() => updateParams({ category: "" })}
                />
                전체
              </label>
            </li>
            {CATEGORIES.map((name) => (
              <li key={name}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={category === name}
                    onChange={() => updateParams({ category: category === name ? "" : name })}
                  />
                  {name}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.group}>
          <h2 className={styles.groupTitle}>가격대</h2>
          <ul className={styles.checkList}>
            <li>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={!price && min == null && max == null}
                  onChange={() => {
                    setMinText("");
                    setMaxText("");
                    updateParams({ price: "", min: "", max: "" });
                  }}
                />
                전체
              </label>
            </li>
            {PRICE_RANGES.map((r) => (
              <li key={r.value}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={price === r.value}
                    onChange={() => {
                      setMinText("");
                      setMaxText("");
                      updateParams({ price: price === r.value ? "" : r.value, min: "", max: "" });
                    }}
                  />
                  {r.label}
                </label>
              </li>
            ))}
          </ul>
          <form
            className={styles.priceRange}
            onSubmit={(e) => {
              e.preventDefault();
              applyCustomPrice();
            }}
          >
            <input
              className={styles.priceInput}
              inputMode="numeric"
              placeholder="최소 금액"
              aria-label="최소 금액"
              value={minText}
              onChange={(e) => setMinText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={applyCustomPrice}
            />
            <span className={styles.dash} />
            <input
              className={styles.priceInput}
              inputMode="numeric"
              placeholder="최대 금액"
              aria-label="최대 금액"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={applyCustomPrice}
            />
            <button type="submit" hidden />
          </form>
        </section>
      </aside>

      {/* ===== 상품 목록 (오른쪽) ===== */}
      <section className={styles.products}>
        <h1 className={styles.title}>{title}</h1>

        {error && <p className={styles.message}>{error}</p>}
        {!error && !loading && visible.length === 0 && (
          <p className={styles.message}>
            {q ? "검색 결과가 없어요. 다른 검색어로 찾아보세요." : "조건에 맞는 상품이 없어요."}
          </p>
        )}

        <div className={`${styles.grid} ${loading ? styles.loading : ""}`}>
          {visible.map((product) => (
            <Card key={product.pid} product={product} />
          ))}
        </div>

      </section>

      <div className={styles.pagination}>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(next) => {
            setPage(next);
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    </div>
  );
}

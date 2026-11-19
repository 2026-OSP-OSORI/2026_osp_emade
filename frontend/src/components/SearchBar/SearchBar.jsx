import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import searchIcon from "../../assets/svg/search.svg";
import clockIcon from "../../assets/svg/clock.svg";
import xThinIcon from "../../assets/svg/x-thin.svg";
import Card from "../Card/Card";
import styles from "./SearchBar.module.css";

/**
 * recentSearches accepts strings or { term, date } entries.
 * Other props remain compatible with the existing SearchBar API.
 */
export default function SearchBar({
  initialQuery = "",
  onSearch,
  suggestions = [],
  recentSearches = [],
  onRemoveRecent,
  onClearRecent,
  recommendedProducts = [],
  placeholder = "상품, 태그로 검색해보세요!",
  searchPath = "/products",
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);

  if (prevInitialQuery !== initialQuery) {
    setPrevInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const submit = (value) => {
    const keyword = String(value).trim();
    if (!keyword) return;
    if (onSearch) onSearch(keyword);
    else navigate(`${searchPath}?q=${encodeURIComponent(keyword)}`);
    setQuery(keyword);
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <form
        className={styles.form}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <input
          aria-label="검색어"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          aria-expanded={open}
        />
        <button type="submit" aria-label="검색">
          <img src={searchIcon} alt="" />
        </button>
      </form>

      {open && (
        <div className={styles.panel}>
          <section className={styles.column} aria-label="추천 검색어">
            <h3>추천 검색어</h3>
            <div className={styles.chips}>
              {suggestions.length ? suggestions.map((term) => (
                <button key={term} type="button" className={styles.chip} onClick={() => submit(term)}>
                  {term}
                </button>
              )) : <p className={styles.empty}>추천 검색어가 없습니다.</p>}
            </div>
          </section>

          <section className={styles.column} aria-label="최근 검색어">
            <div className={styles.heading}>
              <h3>최근 검색어</h3>
              {onClearRecent && (
                <button type="button" onClick={onClearRecent}>전체삭제</button>
              )}
            </div>
            {recentSearches.length ? (
              <ul className={styles.recents}>
                {recentSearches.map((item, index) => {
                  const term = typeof item === "string" ? item : item.term ?? item.keyword ?? "";
                  const date = typeof item === "string" ? "" : item.date ?? "";
                  return (
                    <li key={`${term}-${index}`}>
                      <button type="button" className={styles.recentTerm} onClick={() => submit(term)}>
                        <img src={clockIcon} alt="" aria-hidden="true" />
                        <span className={styles.recentLabel}>{term}</span>
                      </button>
                      <span className={styles.recentActions}>
                        {date && <span className={styles.date}>{date}</span>}
                        {onRemoveRecent && (
                          <button type="button" className={styles.remove} aria-label={`${term} 삭제`} onClick={() => onRemoveRecent(term)}>
                            <img src={xThinIcon} alt="" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className={styles.empty}>최근 검색어가 없습니다.</p>}
          </section>

          <section className={styles.column} aria-label="추천 상품">
            <h3>추천 상품</h3>
            {recommendedProducts.length ? (
              <div className={styles.products}>
                {recommendedProducts.slice(0, 3).map((product) => (
                  <Card
                    key={product.pid ?? product.id ?? product.name}
                    variant="sm"
                    product={{ ...product, pid: product.pid ?? product.id }}
                  />
                ))}
              </div>
            ) : <p className={styles.empty}>추천 상품이 없습니다.</p>}
          </section>

          <button type="button" className={styles.close} onClick={() => setOpen(false)}>닫기</button>
        </div>
      )}
    </div>
  );
}

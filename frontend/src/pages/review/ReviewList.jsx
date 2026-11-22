// 리뷰 목록 — 원본: review-list.html / Figma 리뷰 목록
//   주소: /reviews?pid=상품ID  (상품 상세의 '리뷰 더보기'에서 들어옴)
//   정렬·페이지는 주소(?sort=&page=)에 담아서, 뒤로 가기 해도 그대로 유지됩니다.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Pagination from "../../components/Pagination/Pagination";
import {
  getProductReviews,
  getReviewSummary,
  REVIEW_SORTS,
} from "../../api/reviews";
import { toErrorMessage } from "../../utils/validation";
import RatingSummary from "./components/RatingSummary";
import ReviewItem from "./components/ReviewItem";
import styles from "./ReviewList.module.css";

const PAGE_SIZE = 10;
const PHOTO_PREVIEW_COUNT = 6; // 백엔드 PHOTO_PREVIEW_LIMIT 와 같게

export default function ReviewList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pid = searchParams.get("pid");
  const sort = searchParams.get("sort") ?? "latest";
  const page = Number(searchParams.get("page")) || 1;

  const [summary, setSummary] = useState(null);
  // 목록 결과를 어떤 조건(key)으로 불러온 것인지와 함께 보관
  //   → 조건이 바뀌면 key 가 달라져서 자동으로 '불러오는 중' (이전 목록은 흐리게 유지)
  const listKey = `${pid}|${sort}|${page}`;
  const [list, setList] = useState({
    key: null,
    total: 0,
    reviews: [],
    error: "",
  });
  const loading = list.key !== listKey;
  const error = list.error;

  // 별점 요약: 상품이 바뀔 때만 (실패하면 요약 칸만 숨김)
  useEffect(() => {
    if (!pid) return;
    let ignore = false;
    getReviewSummary(pid)
      .then((data) => !ignore && setSummary(data))
      .catch(() => !ignore && setSummary(null));
    return () => {
      ignore = true;
    };
  }, [pid]);

  // 리뷰 목록: 정렬·페이지가 바뀔 때마다
  useEffect(() => {
    if (!pid) return;
    let ignore = false;
    const key = `${pid}|${sort}|${page}`;
    getProductReviews(pid, { sort, page, limit: PAGE_SIZE })
      .then(
        (data) =>
          !ignore &&
          setList({
            key,
            total: data?.total ?? 0,
            reviews: data?.reviews ?? [],
            error: "",
          }),
      )
      .catch(
        (err) =>
          !ignore &&
          setList({ key, total: 0, reviews: [], error: toErrorMessage(err) }),
      );
    return () => {
      ignore = true;
    };
  }, [pid, sort, page]);

  // 주소의 조건 바꾸기 (정렬을 바꾸면 1페이지로)
  const updateParams = (changes, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "")
        next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next);
  };

  const changePage = (nextPage) => {
    updateParams({ page: nextPage }, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!pid) {
    return (
      <p className={styles.empty}>
        상품 정보가 없어요. 상품 상세에서 리뷰를 확인해 주세요.
      </p>
    );
  }

  const reviewCount = summary?.reviewCount ?? list.total;
  const photoCount = summary?.photoReviewCount ?? 0;
  const previews = summary?.photoPreviews ?? [];
  const morePhotos = photoCount - previews.length;
  const totalPages = Math.ceil(list.total / PAGE_SIZE);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        리뷰 <span>{reviewCount.toLocaleString()}</span>
      </h1>

      {summary && <RatingSummary summary={summary} />}

      {/* ===== 포토 리뷰 ===== */}
      {photoCount > 0 && (
        <section className={styles.photos}>
          <h2 className={styles.photosTitle}>
            포토 리뷰 <span>{photoCount}</span>
          </h2>
          <ul className={styles.photoList}>
            {previews.slice(0, PHOTO_PREVIEW_COUNT).map(({ rid, image }) => (
              <li key={rid}>
                <Link to={`/reviews/${rid}`}>
                  <img src={image} alt="" />
                </Link>
              </li>
            ))}
            {morePhotos > 0 && (
              <li>
                {/* 남은 포토 리뷰 개수만 표시 */}
                <span className={styles.more}>+ {morePhotos}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ===== 정렬 ===== */}
      <div className={styles.toolbar}>
        <ul className={styles.sorts}>
          {REVIEW_SORTS.map(({ value, label }) => (
            <li key={value}>
              <button
                type="button"
                className={sort === value ? styles.active : ""}
                aria-pressed={sort === value}
                onClick={() =>
                  updateParams({ sort: value === "latest" ? null : value })
                }
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ===== 리뷰 목록 ===== */}
      {error ? (
        <p className={styles.empty} role="alert">
          {error}
        </p>
      ) : loading && list.reviews.length === 0 ? (
        <p className={styles.empty}>리뷰를 불러오는 중이에요.</p>
      ) : list.reviews.length === 0 ? (
        <p className={styles.empty}>아직 작성된 리뷰가 없어요.</p>
      ) : (
        <ul className={`${styles.reviews} ${loading ? styles.loading : ""}`}>
          {list.reviews.map((review) => (
            <ReviewItem key={review.rid} review={review} />
          ))}
        </ul>
      )}

      <div className={styles.pagination}>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={changePage}
        />
      </div>
    </div>
  );
}

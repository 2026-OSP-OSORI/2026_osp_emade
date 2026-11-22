// 리뷰 목록 위 별점 요약 — 평균 점수 + 점수별 비율 막대
//   summary: GET /products/:pid/reviews/summary 응답
import { formatRating } from "../../../utils/format";
import StarRating from "./StarRating";
import styles from "./RatingSummary.module.css";

const SCORES = ["5", "4", "3", "2", "1"];

export default function RatingSummary({ summary }) {
  const { averageRating = 0, reviewCount = 0, ratingDistribution = {} } = summary ?? {};

  return (
    <section className={styles.summary} aria-label="별점 요약">
      <div className={styles.score}>
        <strong>{formatRating(averageRating)}</strong>
        <StarRating value={averageRating} size={22} />
        <p>리뷰 {reviewCount.toLocaleString()}개</p>
      </div>

      <ul className={styles.bars}>
        {SCORES.map((score) => {
          const percent = Number(ratingDistribution[score] ?? 0);
          return (
            <li key={score}>
              <span className={styles.label}>{score}점</span>
              {/* 막대 길이 = 줄 너비 × 비율 (100%여도 % 글자 자리는 남김) */}
              <span className={styles.bar} style={{ width: `${percent * 0.87}%` }} />
              <span className={styles.value}>{percent.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

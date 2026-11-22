// 별점 표시 (읽기 전용) — 평균 4.2 처럼 소수면 반올림해서 채운 별 개수를 정합니다.
//   <StarRating value={4.2} size={22} />
import starOn from "../../../assets/svg/star-on.svg";
import starOff from "../../../assets/svg/star-off.svg";
import styles from "./StarRating.module.css";

export default function StarRating({ value = 0, size = 22, gap }) {
  const filled = Math.round(Number(value) || 0);

  return (
    <span
      className={styles.stars}
      style={{ gap: gap ?? Math.round(size / 4) }}
      role="img"
      aria-label={`별점 ${filled}점`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <img key={n} src={n <= filled ? starOn : starOff} alt="" width={size} height={size} />
      ))}
    </span>
  );
}

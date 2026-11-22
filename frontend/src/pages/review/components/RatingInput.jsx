// 별점 고르기 (리뷰 작성) — 마우스를 올리면 미리 채워지고, 누르면 선택
//   <RatingInput value={rating} onChange={setRating} />
import { useState } from "react";
import starOn from "../../../assets/svg/star-on.svg";
import starOff from "../../../assets/svg/star-off.svg";
import styles from "./RatingInput.module.css";

export default function RatingInput({ value = 0, onChange, size = 46 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className={styles.stars} role="radiogroup" aria-label="별점" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          className={styles.star}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange?.(n)}
        >
          <img src={n <= shown ? starOn : starOff} alt="" width={size} height={size} />
        </button>
      ))}
    </div>
  );
}

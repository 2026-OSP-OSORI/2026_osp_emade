// 리뷰 목록 한 줄 — 별점, 도움돼요, 작성자, 제목·내용, 사진
//   review: GET /products/:pid/reviews 의 reviews[] 한 개
import { Link } from "react-router-dom";
import { formatDate, maskNickname } from "../../../utils/format";
import StarRating from "./StarRating";
import HelpfulButton from "./HelpfulButton";
import styles from "./ReviewItem.module.css";

const MAX_PHOTOS = 4;

export default function ReviewItem({ review }) {
  const { rid, userNickname, title, rating, content, images = [], helpfulCount, isHelpful, createdAt } = review;

  return (
    <li className={styles.item}>
      <div className={styles.body}>
        <div className={styles.top}>
          <StarRating value={rating} size={24} />
          <HelpfulButton rid={rid} count={helpfulCount} isHelpful={isHelpful} />
        </div>

        <Link to={`/reviews/${rid}`} className={styles.link}>
          <p className={styles.meta}>
            <span className={styles.name}>{maskNickname(userNickname)}</span>
            <span className={styles.date}>{formatDate(createdAt)}</span>
          </p>
          {title && <p className={styles.title}>{title}</p>}
          <p className={styles.content}>{content}</p>
        </Link>
      </div>

      {images.length > 0 && (
        <Link to={`/reviews/${rid}`} className={styles.photos} aria-label="리뷰 사진 크게 보기">
          {images.slice(0, MAX_PHOTOS).map((src) => (
            <img key={src} src={src} alt="" />
          ))}
        </Link>
      )}
    </li>
  );
}

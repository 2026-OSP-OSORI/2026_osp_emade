// 사진 크게 보기 — 큰 사진 + 좌우 화살표 + 아래 썸네일
//   <ImageGallery images={["url1", "url2"]} alt="리뷰 사진" />
//   상품 상세 사진에도 쓸 수 있어서, 필요하면 components/ 로 옮겨 같이 써도 됩니다.
import { useState } from "react";
import arrowLeft from "../../../assets/svg/arrow-left.svg";
import arrowRight from "../../../assets/svg/arrow-right.svg";
import styles from "./ImageGallery.module.css";

export default function ImageGallery({ images = [], alt = "" }) {
  const [index, setIndex] = useState(0);
  const count = images.length;

  if (count === 0) return <div className={styles.placeholder} aria-hidden="true" />;

  const current = Math.min(index, count - 1);
  // 처음/끝에서 화살표를 누르면 반대쪽으로 돌아감
  const move = (step) => setIndex((current + step + count) % count);

  return (
    <div className={styles.gallery}>
      <div className={styles.main}>
        <img src={images[current]} alt={`${alt} ${current + 1}/${count}`} />
        {count > 1 && (
          <>
            <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => move(-1)} aria-label="이전 사진">
              <img src={arrowLeft} alt="" />
            </button>
            <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => move(1)} aria-label="다음 사진">
              <img src={arrowRight} alt="" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className={styles.thumbs}>
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                className={i === current ? styles.active : ""}
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}번째 사진 보기`}
                aria-current={i === current}
              >
                <img src={src} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 리뷰 상세 — 원본: review-detail.html / Figma 리뷰 상세 (판매자 답글 4가지 상태)
//   주소: /reviews/:id
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getReviewDetail } from "../../api/reviews";
import { formatDate, formatPrice, formatRating, maskNickname } from "../../utils/format";
import { toErrorMessage } from "../../utils/validation";
import arrowLeft from "../../assets/svg/arrow-left.svg";
import starOn from "../../assets/svg/star-on.svg";
import profileIcon from "../../assets/svg/profile.svg";
import ImageGallery from "./components/ImageGallery";
import StarRating from "./components/StarRating";
import HelpfulButton from "./components/HelpfulButton";
import SellerReply from "./components/SellerReply";
import styles from "./ReviewDetail.module.css";

export default function ReviewDetail() {
  const { id } = useParams();
  // 불러온 결과를 어떤 리뷰(id)의 것인지와 함께 보관 → 다른 리뷰로 이동하면 자동으로 '불러오는 중'
  const [result, setResult] = useState({ id: null, review: null, error: "" });

  useEffect(() => {
    let ignore = false;
    getReviewDetail(id)
      .then((data) => !ignore && setResult({ id, review: data, error: "" }))
      .catch((err) => !ignore && setResult({ id, review: null, error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [id]);

  const isCurrent = result.id === id;
  const review = isCurrent ? result.review : null;
  const error = isCurrent ? result.error : "";

  if (error) return <p className={styles.message} role="alert">{error}</p>;
  if (!review) return <p className={styles.message}>리뷰를 불러오는 중이에요.</p>;

  const { product = {} } = review;
  // 리뷰 사진이 없으면 상품 대표 사진을 대신 보여 줌
  const images = review.images?.length ? review.images : product.image ? [product.image] : [];

  // 답글 등록 후 화면에 바로 반영
  const handleReplied = (content, repliedAt) =>
    setResult((prev) => ({
      ...prev,
      review: { ...prev.review, sellerReply: content, sellerRepliedAt: repliedAt ?? new Date().toISOString() },
    }));

  return (
    <div className={styles.page}>
      <Link to={product.pid ? `/reviews?pid=${encodeURIComponent(product.pid)}` : "/"} className={styles.back}>
        <img src={arrowLeft} alt="" />
        리뷰 목록으로
      </Link>

      <div className={styles.inner}>
        <ImageGallery key={review.rid} images={images} alt="리뷰 사진" />

        <section className={styles.content}>
          <div className={styles.top}>
            <div className={styles.rating}>
              <StarRating value={review.rating} size={28} gap={6} />
              <strong>{formatRating(review.rating)}</strong>
            </div>
            <HelpfulButton
              key={review.rid}
              rid={review.rid}
              count={review.helpfulCount}
              isHelpful={review.isHelpful}
              size="lg"
            />
          </div>

          <div className={styles.author}>
            <img
              className={styles.profile}
              src={review.userImage || profileIcon}
              alt=""
              onError={(e) => {
                e.currentTarget.src = profileIcon;
              }}
            />
            <div>
              <p className={styles.name}>{maskNickname(review.userNickname)}</p>
              <p className={styles.date}>{formatDate(review.createdAt)}</p>
            </div>
          </div>

          <div className={styles.text}>
            {review.title && <p className={styles.title}>{review.title}</p>}
            <p className={styles.body}>{review.content}</p>
          </div>

          {/* 내가 쓴 리뷰면 수정 버튼 (API 명세 17번: isMine) */}
          {review.isMine && (
            <div className={styles.mine}>
              <Link to={`/reviews/new?rid=${encodeURIComponent(review.rid)}`} className={styles.edit}>
                리뷰 수정
              </Link>
            </div>
          )}

          <SellerReply
            rid={review.rid}
            reply={review.sellerReply}
            repliedAt={review.sellerRepliedAt}
            isSeller={review.isSeller}
            onReplied={handleReplied}
          />

          {product.pid && (
            <Link to={`/products/${product.pid}`} className={styles.product}>
              <span className={styles.productImage}>
                {product.image && <img src={product.image} alt="" />}
              </span>
              <span className={styles.productInfo}>
                <span className={styles.productName}>{product.name}</span>
                <span className={styles.productMeta}>
                  {formatPrice(product.price)}
                  <span className={styles.productRating}>
                    <img src={starOn} alt="" />
                    {formatRating(product.averageRating)} ({product.reviewCount ?? 0})
                  </span>
                </span>
              </span>
              <span className={styles.go}>상품 보러가기</span>
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

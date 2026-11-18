// 공통 상품 카드
// 수정 시 팀 공유 필수
//
// 사용법 (반드시 유념 후 사용!!!)
//   <Card product={product} />                       기본 (판매자 프로필 포함)       card1
//   <Card product={product} variant="noProfile" />   판매자 없음 (메인 인기 상품)    card2
//   <Card product={product} variant="sm" />          작은 카드 (검색 추천 상품 등)   card3
//   <Card product={product} variant="horizontal" />  가로형 (판매자 프로필 포함)     card4
//
// product — 백엔드 API 응답의 상품 정보를 그대로 넘기면 됩니다.
//   { pid, name, price, image, sellerNickname, sellerImage, isLiked }
//   (sellerNickname 이 없으면 판매자 줄은 표시하지 않습니다)
//
// 찜(하트)
//   onLikeChange(pid, nextLiked): 하트를 누르면 호출 → 페이지에서 찜 API 를 연결해 주세요.
//     - 화면의 하트는 바로 바뀌고, onLikeChange 가 에러를 던지면 원래대로 되돌아갑니다.
//     - 로그인하지 않았으면 호출되지 않고 로그인 페이지로 이동합니다.
//   예) <Card product={p} onLikeChange={(pid, liked) => (liked ? addLike(pid) : removeLike(pid))} />
import { useState } from "react";
import { Link } from "react-router-dom";
import useRequireLogin from "../../hooks/useRequireLogin";
import likeOnIcon from "../../assets/svg/like-On.svg";
import likeOffIcon from "../../assets/svg/like-Off.svg";
import profileIcon from "../../assets/svg/profile.svg";
import styles from "./Card.module.css";

const VARIANT_CLASS = {
  default: "",
  noProfile: styles.noProfile,
  sm: styles.sm,
  horizontal: styles.horizontal,
};

// 판매자 프로필을 보여주는 카드 종류
const WITH_SELLER = ["default", "horizontal"];

export default function Card({ product, variant = "default", onLikeChange }) {
  const {
    pid,
    name,
    price,
    image,
    sellerNickname,
    sellerImage,
    isLiked = false,
  } = product;
  const [liked, setLiked] = useState(isLiked);
  const [imageFailed, setImageFailed] = useState(false); // 상품 사진을 못 불러오면 회색 칸으로
  const requireLogin = useRequireLogin();

  const handleLike = () =>
    requireLogin(async () => {
      const next = !liked;
      setLiked(next); // 화면 먼저 바꾸기
      try {
        await onLikeChange?.(pid, next);
      } catch {
        setLiked(!next); // 실패하면 되돌리기
      }
    });

  const showSeller = WITH_SELLER.includes(variant) && sellerNickname;

  return (
    <article className={`${styles.card} ${VARIANT_CLASS[variant] ?? ""}`}>
      <Link to={`/products/${pid}`} className={styles.link}>
        <div className={styles.thumb}>
          {image && !imageFailed && (
            <img src={image} alt={name} onError={() => setImageFailed(true)} />
          )}
        </div>

        <div className={styles.info}>
          <p className={styles.title}>{name}</p>
          <p className={styles.price}>{Number(price).toLocaleString()}원</p>

          {showSeller && (
            <div className={styles.seller}>
              <span className={styles.profile}>
                <img
                  src={sellerImage || profileIcon}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = profileIcon; // 프로필 사진을 못 불러오면 기본 아이콘
                  }}
                />
              </span>
              <span className={styles.sellerName}>{sellerNickname}</span>
            </div>
          )}
        </div>
      </Link>

      <button
        type="button"
        className={styles.like}
        onClick={handleLike}
        aria-pressed={liked}
        aria-label={liked ? "찜 해제" : "찜하기"}
      >
        <img src={liked ? likeOnIcon : likeOffIcon} alt="" />
      </button>
    </article>
  );
}

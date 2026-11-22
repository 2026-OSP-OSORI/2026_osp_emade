// 판매자별 전체 상품 목록 — 원본: seller-products.html / Figma 판매자 페이지   (담당: 유나)
//   주소: /sellers/:sellerId/products  (상품 상세의 판매자 이름, 랭킹의 '상품 보기'에서 들어옴)
//
// API
//   GET /users/{uid}                                  프로필 · 판매 랭킹 · 팔로잉/팔로워 · 팔로우 여부
//   POST/DELETE /users/{uid}/follows                  팔로우
//   GET /products?sellerId={uid}&sort=soldCount&limit=3   인기 상품 TOP3 (명세)
//   GET /products?sellerId={uid}&sort=newest          전체 상품 (커서 방식 → 더보기)
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../components/Card/Card";
import { getProducts, toCardProduct, toProductList } from "../../api/products";
import { followUser, getUserProfile, unfollowUser } from "../../api/users";
import useProductList from "../../hooks/useProductList";
import useRequireLogin from "../../hooks/useRequireLogin";
import { toErrorMessage } from "../../utils/validation";
import addIcon from "../../assets/svg/add-white.svg";
import profileIcon from "../../assets/svg/profile.svg";
import styles from "./SellerProducts.module.css";

const PAGE_SIZE = 20;
const BADGE_CLASS = [styles.first, styles.second, styles.third];

export default function SellerProducts() {
  const { sellerId } = useParams();
  const requireLogin = useRequireLogin();

  const [profile, setProfile] = useState({ uid: null, data: null, error: "" });
  const [best, setBest] = useState({ uid: null, list: [] });

  useEffect(() => {
    let ignore = false;
    getUserProfile(sellerId)
      .then((data) => !ignore && setProfile({ uid: sellerId, data, error: "" }))
      .catch((err) => !ignore && setProfile({ uid: sellerId, data: null, error: toErrorMessage(err) }));
    getProducts({ sellerId, sort: "soldCount", limit: 3 })
      .then((data) => !ignore && setBest({ uid: sellerId, list: toProductList(data).list.map(toCardProduct) }))
      .catch(() => !ignore && setBest({ uid: sellerId, list: [] }));
    return () => {
      ignore = true;
    };
  }, [sellerId]);

  const { products, loading, loadingMore, error, hasMore, loadMore } = useProductList(
    { sellerId, sort: "newest" },
    PAGE_SIZE,
  );

  const seller = profile.uid === sellerId ? profile.data : null;
  const profileError = profile.uid === sellerId ? profile.error : "";
  const bestList = best.uid === sellerId ? best.list : [];

  // 팔로우 — 누르면 바로 바꾸고, 실패하면 되돌리기
  const [follow, setFollow] = useState(null); // { uid, isFollowing, followerCount } 내가 누른 뒤의 값
  const isFollowing = follow?.uid === sellerId ? follow.isFollowing : Boolean(seller?.isFollowing);
  const followerCount = follow?.uid === sellerId ? follow.followerCount : (seller?.followerCount ?? 0);

  const toggleFollow = () =>
    requireLogin(async () => {
      const before = { uid: sellerId, isFollowing, followerCount };
      const next = !isFollowing;
      setFollow({ uid: sellerId, isFollowing: next, followerCount: followerCount + (next ? 1 : -1) });
      try {
        await (next ? followUser(sellerId) : unfollowUser(sellerId));
      } catch {
        setFollow(before);
      }
    });

  if (profileError) {
    return (
      <div className={styles.empty}>
        <p>{profileError}</p>
        <Link to="/ranking">랭킹으로</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ===== 판매자 프로필 + 인기 상품 TOP3 ===== */}
      <section className={styles.hero}>
        <div className={styles.profile}>
          <div className={styles.profileTop}>
            <img
              className={styles.profileImg}
              src={seller?.profileImage || profileIcon}
              alt=""
              onError={(e) => {
                e.currentTarget.src = profileIcon;
              }}
            />
            <div>
              <h1 className={styles.name}>{seller?.nickname ?? " "}</h1>
              {seller && !seller.isMe && (
                <button
                  type="button"
                  className={`${styles.followBtn} ${isFollowing ? styles.following : ""}`}
                  onClick={toggleFollow}
                  aria-pressed={isFollowing}
                >
                  {!isFollowing && <img src={addIcon} alt="" />}
                  {isFollowing ? "팔로잉" : "팔로우"}
                </button>
              )}
            </div>
          </div>
          <ul className={styles.stats}>
            <li>
              <strong>{seller?.sellerRank ? `${seller.sellerRank}위` : "-위"}</strong>
              <span>판매랭킹</span>
            </li>
            <li>
              <strong>{seller?.followingCount ?? 0}</strong>
              <span>팔로잉</span>
            </li>
            <li>
              <strong>{followerCount}</strong>
              <span>팔로워</span>
            </li>
          </ul>
        </div>

        {bestList.length > 0 && (
          <ol className={styles.best} aria-label="인기 상품 TOP3">
            {bestList.map((product, i) => (
              <li key={product.pid} className={styles.bestItem}>
                <span className={`${styles.badge} ${BADGE_CLASS[i]}`}>{i + 1}</span>
                <Card product={product} variant="noProfile" />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ===== 판매자 전체 상품 ===== */}
      <section className={styles.all}>
        <h2 className={styles.srOnly}>전체 상품</h2>
        {error && <p className={styles.message}>{error}</p>}
        {!error && !loading && products.length === 0 && <p className={styles.message}>아직 등록한 상품이 없어요.</p>}
        <div className={`${styles.grid} ${loading ? styles.loading : ""}`}>
          {products.map((product) => (
            <Card key={product.pid} product={product} variant="noProfile" />
          ))}
        </div>
        {hasMore && (
          <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "불러오는 중..." : "상품 더보기"}
          </button>
        )}
      </section>
    </div>
  );
}

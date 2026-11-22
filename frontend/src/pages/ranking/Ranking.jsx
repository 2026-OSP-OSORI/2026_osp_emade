// 랭킹 — 원본: ranking.html / Figma 랭킹   (담당: 유나)
//   주소: /ranking  (헤더 '랭킹' 메뉴)
//
// API
//   GET /products/popular?limit=9   인기 상품 (어제 랭킹 점수 순) — 1~3위 큰 카드, 4~9위 가로 카드
//   GET /rankings/sellers?limit=6   인기 판매자 (판매 수 같으면 같은 순위)
//   GET /users/{uid}                인기 상품 응답에 판매자 이름이 없어서 카드의 판매자 줄을 채우려고 따로 조회
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card/Card";
import { getPopularProducts, toCardProduct } from "../../api/products";
import { getTopSellers } from "../../api/rankings";
import { getUserProfile } from "../../api/users";
import profileIcon from "../../assets/svg/profile.svg";
import styles from "./Ranking.module.css";

const PRODUCT_COUNT = 9; // 명세 최대 10
const SELLER_COUNT = 6;
const BADGE_CLASS = [styles.first, styles.second, styles.third];

export default function Ranking() {
  const [products, setProducts] = useState(null); // null: 불러오는 중
  const [sellers, setSellers] = useState(null);

  useEffect(() => {
    let ignore = false;
    getPopularProducts({ limit: PRODUCT_COUNT })
      .then(async (data) => {
        const list = (Array.isArray(data) ? data : (data?.items ?? [])).map(toCardProduct);
        // 판매자 이름·사진 채우기 (같은 판매자는 한 번만 조회, 실패하면 판매자 줄 없이 표시)
        const ids = [...new Set(list.filter((p) => !p.sellerNickname && p.sellerId).map((p) => p.sellerId))];
        const profiles = await Promise.all(ids.map((uid) => getUserProfile(uid).catch(() => null)));
        const byId = Object.fromEntries(ids.map((uid, i) => [uid, profiles[i]]));
        if (ignore) return;
        setProducts(
          list.map((p) =>
            byId[p.sellerId]
              ? { ...p, sellerNickname: byId[p.sellerId].nickname, sellerImage: byId[p.sellerId].profileImage }
              : p,
          ),
        );
      })
      .catch(() => !ignore && setProducts([]));
    getTopSellers(SELLER_COUNT)
      .then((data) => !ignore && setSellers(Array.isArray(data) ? data : []))
      .catch(() => !ignore && setSellers([]));
    return () => {
      ignore = true;
    };
  }, []);

  const top = (products ?? []).slice(0, 3);
  const rest = (products ?? []).slice(3);

  return (
    <div className={styles.page}>
      <div className={styles.ranking}>
        {/* ===== 인기 상품 ===== */}
        <section className={styles.popular}>
          <h1 className={styles.title}>인기 상품</h1>
          {products?.length === 0 && <p className={styles.message}>아직 집계된 인기 상품이 없어요.</p>}

          <ol className={styles.top}>
            {top.map((product, i) => (
              <li key={product.pid} className={styles.topItem}>
                <span className={`${styles.badge} ${BADGE_CLASS[i]}`}>{product.rank ?? i + 1}</span>
                <Card product={product} />
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <ol className={styles.rest} start={4}>
              {rest.map((product, i) => (
                <li key={product.pid} className={styles.restItem}>
                  <span className={styles.rankNum}>{product.rank ?? i + 4}</span>
                  <Card product={product} variant="horizontal" />
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ===== 인기 판매자 ===== */}
        <section className={styles.sellers}>
          <h2 className={styles.title}>인기 판매자</h2>
          {sellers?.length === 0 && <p className={styles.message}>아직 판매 기록이 있는 판매자가 없어요.</p>}
          <ol className={styles.sellerList}>
            {(sellers ?? []).map((seller) => (
              <li key={seller.uid} className={styles.sellerRow}>
                <span className={styles.rankNum}>{seller.rank}</span>
                <img
                  className={styles.sellerImg}
                  src={seller.profileImage || profileIcon}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.src = profileIcon;
                  }}
                />
                <div className={styles.sellerInfo}>
                  <p className={styles.sellerName}>{seller.nickname}</p>
                  <p className={styles.sellerCount}>판매 {Number(seller.soldCount ?? 0).toLocaleString()}건</p>
                </div>
                <Link to={`/sellers/${seller.uid}/products`} className={styles.sellerBtn}>
                  상품 보기
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

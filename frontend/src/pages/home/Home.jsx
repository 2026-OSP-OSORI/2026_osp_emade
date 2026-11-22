// 메인 — 원본: index.html / Figma Main
//   배너 + 인기 상품 6개(판매자 없는 카드) + 추천 상품 4개(기본 카드)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card/Card";
import { getPopularProducts, getProducts } from "../../api/products";
import styles from "./Home.module.css";

// 배너 이미지
const BANNER_IMAGE = "src/assets/img/banner.png";

// 응답이 배열이든 { products: [...] } / { items: [...] } 든 배열로 맞추기
const toList = (data) =>
  Array.isArray(data) ? data : (data?.products ?? data?.items ?? []);

const POPULAR_COUNT = 6;
const RECOMMEND_COUNT = 4;

// 상품 불러오기 — 실패하면 빈 목록
function useProducts(fetchProducts, count) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let ignore = false; // 화면을 떠난 뒤 늦게 온 응답은 무시
    fetchProducts()
      .then((data) => !ignore && setProducts(toList(data).slice(0, count)))
      .catch(() => !ignore && setProducts([]));
    return () => {
      ignore = true;
    };
  }, [fetchProducts, count]);

  return products;
}

export default function Home() {
  const popular = useProducts(getPopularProducts, POPULAR_COUNT);

  // 추천 API 없음 → 상품 목록 앞 4개
  const recommended = useProducts(getProducts, RECOMMEND_COUNT);

  // 배너 이미지를 못 불러오면 숨기기
  const [bannerFailed, setBannerFailed] = useState(false);

  return (
    <div className={styles.home}>
      {/* ===== 배너 ===== */}
      <section className={styles.banner}>
        <div className={styles.bannerText}>
          <p className={styles.bannerSub}>
            벗들의 손끝에서 만들어진 특별한 작품
          </p>
          <h1 className={styles.bannerTitle}>취미가 작품이 되는 순간, Emade</h1>
          <p className={styles.bannerDesc}>
            이화여대 학생 창작자들의 핸드메이드 마켓을 만나보세요.
          </p>
          <Link to="/products" className={styles.bannerButton}>
            상품 둘러보기
          </Link>
        </div>
        {!bannerFailed && (
          <img
            className={styles.bannerImage}
            src={BANNER_IMAGE}
            alt=""
            onError={() => setBannerFailed(true)}
          />
        )}
      </section>

      {/* ===== 인기 상품 ===== */}
      <section className={styles.section} aria-label="인기 상품">
        <div className={styles.popularList}>
          {popular.map((product) => (
            <Card key={product.pid} product={product} variant="noProfile" />
          ))}
        </div>
      </section>

      {/* ===== 추천 상품 ===== */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>추천 상품</h2>
          <Link to="/products" className={styles.more}>
            더보기 &gt;
          </Link>
        </div>
        <div className={styles.recommendList}>
          {recommended.map((product) => (
            <Card key={product.pid} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}

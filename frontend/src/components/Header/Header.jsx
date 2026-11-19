// 공통 헤더 — 로고, 검색창(SearchBar), 우측 메뉴, 카테고리 메뉴(nav)를 담당합니다. 수정 시 팀 공유 필수
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import SearchBar from "../SearchBar/SearchBar";
import useRecentSearches from "../../hooks/useRecentSearches";
import { CATEGORIES } from "../../constants/categories";
import styles from "./Header.module.css";

// 추천 검색어 — 지금은 카테고리 이름을 보여줍니다.
// TODO: 인기 검색어 API 가 생기면 그 결과로 교체해 주세요.
const SUGGESTIONS = CATEGORIES.filter((category) => category !== "기타");

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const currentQuery = searchParams.get("q") ?? "";
  const currentCategory = searchParams.get("category");
  const isProductList = pathname === "/products";

  // TODO: hooks/useAuth 구현되면 아래 두 줄을 교체해 주세요.
  // const { user, logout } = useAuth();
  const user = null;
  const logout = () => {};

  const { recentSearches, addRecent, removeRecent, clearRecent } = useRecentSearches();

  // 검색창 초기값 — /products?q=... 에서는 URL 검색어, 그 외 페이지는 빈 칸
  const initialKeyword = isProductList ? currentQuery : "";

  // 검색 (입력, 추천 검색어, 최근 검색어 클릭 모두) → 최근 검색어에 저장하고 결과 페이지로 이동
  const handleSearch = (keyword) => {
    addRecent(keyword);
    navigate(`/products?q=${encodeURIComponent(keyword)}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // 카테고리 메뉴 활성화 표시 (전체 = /products 에 category, q 가 모두 없을 때)
  const isAllActive = isProductList && !currentCategory && !currentQuery;
  const navClass = (active) => (active ? `${styles.navItem} ${styles.active}` : styles.navItem);

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>

        {/* TODO: 추천 상품 API 가 생기면 recommendedProducts 에 상품 목록을 넘겨 주세요. */}
        <SearchBar
          initialQuery={initialKeyword}
          onSearch={handleSearch}
          suggestions={SUGGESTIONS}
          recentSearches={recentSearches}
          onRemoveRecent={removeRecent}
          onClearRecent={clearRecent}
          recommendedProducts={[]}
        />

        <div className={styles.menu}>
          {user ? (
            <button type="button" className={styles.menuItem} onClick={handleLogout}>
              로그아웃
            </button>
          ) : (
            <Link to="/login" className={styles.menuItem}>
              로그인
            </Link>
          )}
          <Link to="/mypage/wishlist" className={styles.menuItem}>
            찜
          </Link>
          <Link to="/mypage" className={styles.menuItem}>
            마이페이지
          </Link>
          <Link to="/cart" className={styles.menuItem}>
            장바구니
          </Link>
        </div>
      </div>

      <nav className={styles.nav} aria-label="카테고리">
        <Link to="/products" className={navClass(isAllActive)}>
          전체
        </Link>
        {CATEGORIES.slice(0, -1).map((category) => (
          <Link
            key={category}
            to={`/products?category=${encodeURIComponent(category)}`}
            className={navClass(isProductList && currentCategory === category)}
          >
            {category}
          </Link>
        ))}
        <NavLink to="/ranking" className={({ isActive }) => navClass(isActive)}>
          랭킹
        </NavLink>
        <Link
          to={`/products?category=${encodeURIComponent("기타")}`}
          className={navClass(isProductList && currentCategory === "기타")}
        >
          기타
        </Link>
      </nav>
    </header>
  );
}

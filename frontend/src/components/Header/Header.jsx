// 공통 헤더 — 로고, 검색창, 우측 메뉴, 카테고리 메뉴(nav)를 담당합니다. 수정 시 팀 공유 필수
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import searchIcon from "../../assets/svg/search.svg";
import { CATEGORIES } from "../../constants/categories";
import styles from "./Header.module.css";

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

  // 검색창 초기값 — /products?q=... 에서는 URL 검색어, 그 외 페이지는 빈 칸
  // (input 의 key 가 바뀌면 입력창이 이 값으로 다시 초기화됩니다)
  const initialKeyword = isProductList ? currentQuery : "";

  const handleSearch = (e) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) return;
    navigate(`/products?q=${encodeURIComponent(q)}`);
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

        <form className={styles.search} onSubmit={handleSearch} role="search">
          <input
            key={initialKeyword}
            type="text"
            name="q"
            defaultValue={initialKeyword}
            placeholder="상품, 태그로 검색해보세요!"
            aria-label="검색어"
          />
          <button type="submit" aria-label="검색">
            <img src={searchIcon} alt="" />
          </button>
        </form>

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

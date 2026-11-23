// 상품 상세 — 원본: product-detail.html / Figma 상품 상세   (담당: 유나)
//   주소: /products/:id
//
// API
//   GET  /products/{pid}               상품 정보 (판매자 본인이면 stock, pendingDelete 도 옴)
//   GET  /users/{uid}                  판매자 팔로우 여부 · 본인 여부
//   POST/DELETE /users/{uid}/follows   팔로우
//   POST/DELETE /products/{pid}/likes  찜
//   POST /cart-items                   장바구니 담기 { pid, tradeKey, locationId, quantity }
//   POST /orders                       바로 구매 { items: [ 같은 모양 ] } → 구매 완료 화면으로
//   GET  /products/{pid}/reviews       리뷰 미리보기 2개
//   GET  /products?category=           관련 상품 (같은 카테고리)
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Card from "../../components/Card/Card";
import { addCartItem } from "../../api/cart";
import { addLike, removeLike } from "../../api/like";
import { createOrders } from "../../api/orders";
import { getProduct, getProducts, toCardProduct, toLocations, toProductList } from "../../api/products";
import { getProductReviews } from "../../api/reviews";
import { followUser, getUserProfile, unfollowUser } from "../../api/users";
import { categoryLabel } from "../../constants/categories";
import useAuth from "../../hooks/useAuth";
import useRequireLogin from "../../hooks/useRequireLogin";
import { formatPrice, formatTradeKey } from "../../utils/format";
import { toErrorMessage } from "../../utils/validation";
import StarRating from "../review/components/StarRating";
import TradeTimePicker from "./components/TradeTimePicker";
import chevronIcon from "../../assets/svg/chevron-right.svg";
import likeOnIcon from "../../assets/svg/like-On.svg";
import likeOffIcon from "../../assets/svg/like-Off.svg";
import profileIcon from "../../assets/svg/profile.svg";
import styles from "./ProductDetail.module.css";

const THUMB_COUNT = 4;
const REVIEW_PREVIEW = 2;
const RELATED_COUNT = 2;

export default function ProductDetail() {
  const { id: pid } = useParams();
  const navigate = useNavigate();
  const { uid } = useAuth();
  const requireLogin = useRequireLogin();

  const [result, setResult] = useState({ pid: null, product: null, error: "" });
  const product = result.pid === pid ? result.product : null;
  const loadError = result.pid === pid ? result.error : "";

  // 상품 불러오기
  useEffect(() => {
    let ignore = false;
    getProduct(pid)
      .then((data) => !ignore && setResult({ pid, product: data, error: "" }))
      .catch((err) => !ignore && setResult({ pid, product: null, error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [pid]);

  if (loadError) {
    return (
      <div className={styles.empty}>
        <p>{loadError}</p>
        <Link to="/products">상품 목록으로</Link>
      </div>
    );
  }
  if (!product) return <div className={styles.empty}>불러오는 중...</div>;

  // key 로 상품이 바뀌면 화면 상태(선택한 사진·장소·시간 등)를 새로 시작
  return (
    <DetailView
      key={pid}
      product={product}
      isOwner={Boolean(uid) && uid === (product.seller?.uid ?? product.sellerId)}
      requireLogin={requireLogin}
      navigate={navigate}
    />
  );
}

function DetailView({ product, isOwner, requireLogin, navigate }) {
  const { pid, name, description, price, status, stock, pendingDelete } = product;
  const images = product.images ?? [];
  const tags = Array.isArray(product.tags) ? product.tags : Object.keys(product.tags ?? {});
  const locations = toLocations(product.locations);
  const seller = product.seller ?? { uid: product.sellerId, nickname: product.sellerNickname, image: product.sellerImage };
  const category = categoryLabel(product.category);
  const onSale = status === "ON_SALE";

  // ---------- 사진 ----------
  const [photo, setPhoto] = useState(0);
  const movePhoto = (diff) => setPhoto((i) => (i + diff + images.length) % images.length);
  // 썸네일은 4장씩 — 지금 사진이 보이도록 묶음 이동
  const thumbStart = Math.floor(photo / THUMB_COUNT) * THUMB_COUNT;

  // ---------- 찜 ----------
  const [liked, setLiked] = useState(Boolean(product.isLiked));
  const toggleLike = () =>
    requireLogin(async () => {
      const next = !liked;
      setLiked(next);
      try {
        await (next ? addLike(pid) : removeLike(pid));
      } catch {
        setLiked(!next);
      }
    });

  // ---------- 팔로우 ----------
  const [following, setFollowing] = useState(null); // null: 모름 (불러오는 중 / 실패)
  useEffect(() => {
    if (!seller.uid) return;
    let ignore = false;
    getUserProfile(seller.uid)
      .then((data) => !ignore && setFollowing(Boolean(data?.isFollowing)))
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [seller.uid]);
  const toggleFollow = () =>
    requireLogin(async () => {
      const next = !following;
      setFollowing(next);
      try {
        await (next ? followUser(seller.uid) : unfollowUser(seller.uid));
      } catch {
        setFollowing(!next);
      }
    });

  // ---------- 거래 장소 · 시간 · 수량 ----------
  const [openMenu, setOpenMenu] = useState(null); // "place" | "time" | null
  const [locationId, setLocationId] = useState(locations.length === 1 ? locations[0].id : "");
  const [tradeKey, setTradeKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const maxQuantity = typeof stock === "number" ? Math.max(1, stock) : 99; // 재고는 판매자에게만 내려옴
  const selectsRef = useRef(null);

  // 바깥을 누르면 드롭다운 닫기
  useEffect(() => {
    if (!openMenu) return;
    const close = (e) => {
      if (!selectsRef.current?.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  const placeName = locations.find((l) => l.id === locationId)?.name;
  const changeQuantity = (next) => setQuantity(Math.min(maxQuantity, Math.max(1, next || 1)));

  // ---------- 장바구니 / 바로 구매 ----------
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", error: false, toCart: false });
  const ready = Boolean(locationId && tradeKey);

  const checkReady = () => {
    if (ready) return true;
    setMessage({ text: !locationId ? "*거래 장소를 선택해 주세요." : "*거래 시간을 선택해 주세요.", error: true });
    return false;
  };

  const item = { pid, tradeKey, locationId, quantity };

  const handleCart = () =>
    requireLogin(async () => {
      if (!checkReady() || busy) return;
      setBusy(true);
      try {
        await addCartItem(item);
        setMessage({ text: "장바구니에 담았어요.", error: false, toCart: true });
      } catch (err) {
        setMessage({ text: toErrorMessage(err), error: true });
      } finally {
        setBusy(false);
      }
    });

  const handleBuy = () =>
    requireLogin(async () => {
      if (!checkReady() || busy) return;
      setBusy(true);
      try {
        const [order] = await createOrders([item]);
        navigate(`/purchase-confirm/${order?.oid ?? ""}`);
      } catch (err) {
        setMessage({ text: toErrorMessage(err), error: true });
        setBusy(false);
      }
    });

  // ---------- 리뷰 · 관련 상품 ----------
  const [reviews, setReviews] = useState({ total: 0, list: [] });
  const [related, setRelated] = useState([]);
  useEffect(() => {
    let ignore = false;
    getProductReviews(pid, { limit: REVIEW_PREVIEW })
      .then((data) => !ignore && setReviews({ total: data?.total ?? 0, list: data?.reviews ?? [] }))
      .catch(() => {});
    if (product.category) {
      getProducts({ category: product.category, sort: "popular", limit: RELATED_COUNT + 1 })
        .then((data) => {
          if (ignore) return;
          const { list } = toProductList(data);
          setRelated(list.filter((p) => p.pid !== pid).slice(0, RELATED_COUNT).map(toCardProduct));
        })
        .catch(() => {});
    }
    return () => {
      ignore = true;
    };
  }, [pid, product.category]);

  return (
    <div className={styles.page}>
      {/* ===== 브레드크럼 ===== */}
      <nav className={styles.breadcrumb} aria-label="현재 위치">
        <Link to="/">홈</Link>
        <span>&gt;</span>
        {category && (
          <>
            <Link to={`/products?category=${encodeURIComponent(category)}`}>{category}</Link>
            <span>&gt;</span>
          </>
        )}
        <strong>{name}</strong>
      </nav>

      <div className={styles.detail}>
        {/* ===== 왼쪽: 사진 + 설명 ===== */}
        <div className={styles.left}>
          <div className={styles.gallery}>
            <div className={styles.mainPhoto}>
              {images[photo] && <img src={images[photo]} alt={name} />}
              {images.length > 1 && (
                <>
                  <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => movePhoto(-1)} aria-label="이전 사진">
                    <img src={chevronIcon} alt="" />
                  </button>
                  <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => movePhoto(1)} aria-label="다음 사진">
                    <img src={chevronIcon} alt="" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <ul className={styles.thumbs}>
                {images.slice(thumbStart, thumbStart + THUMB_COUNT).map((src, i) => (
                  <li key={src}>
                    <button
                      type="button"
                      className={thumbStart + i === photo ? styles.thumbActive : ""}
                      onClick={() => setPhoto(thumbStart + i)}
                      aria-label={`${thumbStart + i + 1}번째 사진 보기`}
                    >
                      <img src={src} alt="" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section className={styles.desc}>
            <h2 className={styles.descTitle}>상품 설명</h2>
            <p className={styles.descText}>{description}</p>
          </section>
        </div>

        {/* ===== 오른쪽: 상품 정보 + 구매 ===== */}
        <div className={styles.right}>
          <div className={styles.head}>
            <h1 className={styles.name}>{name}</h1>
            {tags.length > 0 && (
              <ul className={styles.tags}>
                {tags.map((tag) => (
                  <li key={tag}>#{tag}</li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.priceRow}>
            <p className={styles.price}>{formatPrice(price)}</p>
            <button
              type="button"
              className={styles.like}
              onClick={toggleLike}
              aria-pressed={liked}
              aria-label={liked ? "찜 해제" : "찜하기"}
            >
              <img src={liked ? likeOnIcon : likeOffIcon} alt="" />
            </button>
          </div>

          <div className={styles.seller}>
            <Link to={`/sellers/${seller.uid}/products`} className={styles.sellerLink}>
              <img
                className={styles.avatar}
                src={seller.image || profileIcon}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = profileIcon;
                }}
              />
              <span className={styles.sellerName}>{seller.nickname}</span>
            </Link>
            {!isOwner && following !== null && (
              <button
                type="button"
                className={`${styles.follow} ${following ? styles.following : ""}`}
                onClick={toggleFollow}
                aria-pressed={following}
              >
                {following ? "팔로잉" : "팔로우"}
              </button>
            )}
          </div>

          {isOwner ? (
            /* 판매자 본인: 구매 대신 관리 */
            <div className={styles.buy}>
              <p className={styles.ownerInfo}>
                내가 등록한 상품이에요 · 재고 {stock ?? "-"}개 ·{" "}
                {pendingDelete ? "삭제 대기 중" : onSale ? "판매중" : status === "ENDED" ? "판매 중단" : "일시 품절"}
              </p>
              <div className={styles.actions}>
                {pendingDelete ? (
                  <span className={`${styles.btn} ${styles.stopped}`}>삭제 대기 중</span>
                ) : (
                  <Link to={`/products/${pid}/edit`} className={`${styles.btn} ${styles.primary} ${styles.wide}`}>
                    상품 수정
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.buy}>
              <div className={styles.selects} ref={selectsRef}>
                {/* 거래 장소 */}
                <div className={`${styles.dropdown} ${styles.placeDropdown}`}>
                  <button
                    type="button"
                    className={`${styles.dropdownBtn} ${openMenu === "place" ? styles.open : ""}`}
                    onClick={() => setOpenMenu(openMenu === "place" ? null : "place")}
                    aria-expanded={openMenu === "place"}
                    disabled={!onSale}
                  >
                    <span>{placeName ?? "거래 장소 선택"}</span>
                  </button>
                  {openMenu === "place" && (
                    <ul className={styles.placeList} role="listbox" aria-label="거래 장소">
                      {locations.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={l.id === locationId}
                            className={`${styles.placeOption} ${l.id === locationId ? styles.placeSelected : ""}`}
                            onClick={() => {
                              setLocationId(l.id);
                              setOpenMenu(null);
                              setMessage({ text: "" });
                            }}
                          >
                            {l.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 거래 시간 */}
                <div className={`${styles.dropdown} ${styles.timeDropdown}`}>
                  <button
                    type="button"
                    className={`${styles.dropdownBtn} ${openMenu === "time" ? styles.open : ""}`}
                    onClick={() => setOpenMenu(openMenu === "time" ? null : "time")}
                    aria-expanded={openMenu === "time"}
                    disabled={!onSale}
                  >
                    <span>{tradeKey ? formatTradeKey(tradeKey) : "거래 시간 선택"}</span>
                  </button>
                  {openMenu === "time" && (
                    <TradeTimePicker
                      pid={pid}
                      value={tradeKey}
                      onDone={(key) => {
                        setTradeKey(key);
                        setOpenMenu(null);
                        setMessage({ text: "" });
                      }}
                    />
                  )}
                </div>
              </div>

              <p className={styles.stock}>
                {status === "TEMP_SOLD_OUT" ? "일시 품절" : status === "ENDED" ? "판매가 중단된 상품이에요" : " "}
              </p>
              <div className={styles.qtyRow}>
                <div className={styles.qty}>
                  <button
                    type="button"
                    className={`${styles.qtyBtn} ${styles.minus}`}
                    onClick={() => changeQuantity(quantity - 1)}
                    disabled={!onSale || quantity <= 1}
                    aria-label="수량 빼기"
                  >
                    -
                  </button>
                  <input
                    className={styles.qtyInput}
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => changeQuantity(Number(e.target.value.replace(/[^\d]/g, "")))}
                    disabled={!onSale}
                    aria-label="수량"
                  />
                  <button
                    type="button"
                    className={`${styles.qtyBtn} ${styles.plus}`}
                    onClick={() => changeQuantity(quantity + 1)}
                    disabled={!onSale || quantity >= maxQuantity}
                    aria-label="수량 더하기"
                  >
                    +
                  </button>
                </div>
                <p className={styles.total}>{formatPrice((Number(price) || 0) * quantity)}</p>
              </div>

              <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.gray}`} onClick={handleCart} disabled={!onSale || busy}>
                  장바구니
                </button>
                {onSale ? (
                  <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleBuy} disabled={busy}>
                    {busy ? "처리 중..." : "바로 구매하기"}
                  </button>
                ) : (
                  <span className={`${styles.btn} ${styles.stopped}`}>구매 불가</span>
                )}
              </div>
              {message.text && (
                <p className={message.error ? styles.error : styles.notice} role={message.error ? "alert" : "status"}>
                  {message.text}
                  {message.toCart && <Link to="/cart">장바구니 보기 &gt;</Link>}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== 리뷰 + 관련상품 ===== */}
      <div className={styles.bottom}>
        <section className={styles.reviews}>
          <div className={styles.reviewsHead}>
            <h2 className={styles.smallTitle}>리뷰 ({reviews.total})</h2>
            {reviews.total > 0 && (
              <Link to={`/reviews?pid=${encodeURIComponent(pid)}`} className={styles.moreLink}>
                더보기 &gt;
              </Link>
            )}
          </div>
          {reviews.list.length === 0 ? (
            <p className={styles.noReview}>아직 리뷰가 없어요.</p>
          ) : (
            <ul className={styles.reviewList}>
              {reviews.list.map((r) => (
                <li key={r.rid}>
                  <Link to={`/reviews/${r.rid}`} className={styles.reviewCard}>
                    <div className={styles.reviewTop}>
                      <img
                        className={styles.reviewAvatar}
                        src={r.userImage || profileIcon}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.src = profileIcon;
                        }}
                      />
                      <span className={styles.reviewName}>{r.userNickname}</span>
                      <StarRating value={r.rating} size={20} />
                    </div>
                    <p className={styles.reviewText}>{r.content}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {related.length > 0 && (
          <section className={styles.related}>
            <h2 className={styles.smallTitle}>관련상품</h2>
            <div className={styles.relatedList}>
              {related.map((p) => (
                <Card key={p.pid} product={p} variant="sm" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

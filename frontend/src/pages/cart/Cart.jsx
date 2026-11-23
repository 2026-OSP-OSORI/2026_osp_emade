// 장바구니 — 원본: cart.html / Figma 장바구니   (담당: 유나)
//   주소: /cart  (로그인 필요)
//
// API (백3)
//   GET    /cart-items              목록 (isValid=false 면 마감·품절 등 → 흐리게, 선택 불가)
//   PATCH  /cart-items/{cartKey}    수량 · 거래 장소 · 시간 변경 (장소·시간을 바꾸면 cartKey 도 바뀜)
//   거래 일정 변경은 Figma '장바구니 - 시간 변경' 처럼 가운데 모달(components/ScheduleModal)에서 합니다.
//   DELETE /cart-items { cartKeys } 선택 삭제
//   POST   /orders { items }        거래 예약 (하나라도 안 되면 전부 실패) → 구매 완료 화면
//
// 같은 판매자 · 같은 시간에 거래 두 건은 예약할 수 없어서,
// 선택한 항목끼리 겹치면 빨갛게 표시하고 '거래 예약하기'를 막아요.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CART_INVALID_LABEL, deleteCartItems, getCart, updateCartItem } from "../../api/cart";
import { createOrders } from "../../api/orders";
import useAuth from "../../hooks/useAuth";
import { formatPrice, formatTradeKey } from "../../utils/format";
import { toErrorMessage } from "../../utils/validation";
import ScheduleModal from "./components/ScheduleModal";
import xIcon from "../../assets/svg/x-thin.svg";
import minusIcon from "../../assets/svg/minus.svg";
import plusIcon from "../../assets/svg/plus.svg";
import styles from "./Cart.module.css";

const SORTS = [
  { value: "time", label: "거래 일시 빠른 순" },
  { value: "added", label: "담은 순" },
  { value: "price", label: "가격 높은 순" },
];

// "11/3(월) 12:00" → "11/3 12:00" (요약 목록용)
const shortTime = (tradeKey) => formatTradeKey(tradeKey).replace(/\(.\)/, "");

export default function Cart() {
  const navigate = useNavigate();
  const { isLoggedIn, isLoading } = useAuth();

  const [items, setItems] = useState(null); // null: 불러오는 중
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [sort, setSort] = useState("time");
  const [editing, setEditing] = useState(null); // 일정 바꾸는 중인 항목
  const [message, setMessage] = useState("");
  const [reserving, setReserving] = useState(false);
  const firstLoad = useRef(true);

  // 목록 불러오기 (처음에는 담을 수 있는 항목 전부 선택)
  const load = async () => {
    try {
      const data = await getCart();
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setLoadError("");
      const valid = list.filter((i) => i.isValid).map((i) => i.cartKey);
      const isFirst = firstLoad.current;
      firstLoad.current = false;
      setSelected((prev) => new Set(isFirst ? valid : valid.filter((key) => prev.has(key))));
    } catch (err) {
      setLoadError(toErrorMessage(err));
      setItems([]);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      navigate("/login", { replace: true, state: { from: "/cart" } });
      return;
    }
    load();
    // load 는 화면이 처음 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isLoggedIn, navigate]);

  const list = useMemo(() => items ?? [], [items]);

  // 정렬
  const sorted = useMemo(() => {
    const copy = [...list];
    if (sort === "time") copy.sort((a, b) => String(a.tradeKey).localeCompare(String(b.tradeKey)));
    if (sort === "price") copy.sort((a, b) => b.price * b.quantity - a.price * a.quantity);
    return copy; // added: 서버가 담은 순(최신순)으로 줌
  }, [list, sort]);

  // 선택한 항목끼리 같은 판매자 · 같은 시간 → 두 번째부터 겹침
  const conflicts = useMemo(() => {
    const first = new Map(); // "sellerId|tradeKey" → 먼저 나온 항목
    const result = new Map(); // cartKey → 먼저 나온 항목 이름
    sorted
      .filter((i) => i.isValid && selected.has(i.cartKey))
      .forEach((i) => {
        const slot = `${i.sellerId}|${i.tradeKey}`;
        if (first.has(slot)) result.set(i.cartKey, first.get(slot).productName);
        else first.set(slot, i);
      });
    return result;
  }, [sorted, selected]);

  const validItems = list.filter((i) => i.isValid);
  const chosen = sorted.filter((i) => i.isValid && selected.has(i.cartKey));
  const allChecked = validItems.length > 0 && chosen.length === validItems.length;
  const totalPrice = chosen.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.quantity || 0), 0);
  const totalCount = chosen.reduce((sum, i) => sum + (i.quantity || 0), 0);

  const toggle = (cartKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cartKey)) next.delete(cartKey);
      else next.add(cartKey);
      return next;
    });

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(validItems.map((i) => i.cartKey)));

  // ---------- 변경 ----------
  const changeQuantity = async (item, quantity) => {
    if (quantity < 1) return;
    setMessage("");
    setItems((prev) => prev.map((i) => (i.cartKey === item.cartKey ? { ...i, quantity } : i)));
    try {
      await updateCartItem(item.cartKey, { quantity });
    } catch (err) {
      setMessage(toErrorMessage(err));
      setItems((prev) => prev.map((i) => (i.cartKey === item.cartKey ? { ...i, quantity: item.quantity } : i)));
    }
  };

  // 모달에서 '선택 완료' → 바뀐 것만 PATCH (실패하면 에러를 모달에 표시)
  const changeSchedule = async (item, { locationId, tradeKey }) => {
    const changes = {};
    if (locationId && locationId !== item.locationId) changes.locationId = locationId;
    if (tradeKey && tradeKey !== item.tradeKey) changes.tradeKey = tradeKey;
    if (Object.keys(changes).length > 0) {
      const data = await updateCartItem(item.cartKey, changes);
      // 장소·시간을 바꾸면 cartKey 가 바뀌므로 선택 상태도 새 키로 옮기기
      if (selected.has(item.cartKey) || !item.isValid) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(item.cartKey);
          if (data?.cartKey) next.add(data.cartKey);
          return next;
        });
      }
      await load();
    }
    setEditing(null);
    setMessage("");
  };

  const remove = async (cartKeys) => {
    if (cartKeys.length === 0) return;
    setMessage("");
    try {
      await deleteCartItems(cartKeys);
      setItems((prev) => prev.filter((i) => !cartKeys.includes(i.cartKey)));
      setSelected((prev) => new Set([...prev].filter((key) => !cartKeys.includes(key))));
    } catch (err) {
      setMessage(toErrorMessage(err));
    }
  };

  // ---------- 예약 ----------
  const reserve = async () => {
    if (reserving || chosen.length === 0 || conflicts.size > 0) return;
    setReserving(true);
    setMessage("");
    try {
      const orders = await createOrders(
        chosen.map(({ pid, tradeKey, locationId, quantity, cartKey }) => ({ pid, tradeKey, locationId, quantity, cartKey })),
      );
      navigate(`/purchase-confirm/${orders?.[0]?.oid ?? ""}`);
    } catch (err) {
      setMessage(toErrorMessage(err));
      setReserving(false);
      load(); // 그 사이 마감·품절된 항목 다시 표시
    }
  };

  if (items === null) return <p className={styles.loading}>불러오는 중...</p>;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="현재 위치">
        <Link to="/">홈</Link>
        <span>&gt;</span>
        <strong>장바구니</strong>
      </nav>

      <div className={styles.cart}>
        {/* ===== 장바구니 목록 ===== */}
        <section className={styles.main}>
          <h1 className={styles.title}>
            장바구니 <span>{list.length}</span>
          </h1>

          <div className={styles.listHead}>
            <label className={styles.check}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={validItems.length === 0} />
              전체 선택 ({chosen.length}/{list.length})
            </label>
            <button type="button" className={styles.textBtn} onClick={() => remove([...selected])} disabled={selected.size === 0}>
              선택 삭제
            </button>
          </div>

          {loadError && <p className={styles.empty}>{loadError}</p>}
          {!loadError && list.length === 0 && (
            <div className={styles.empty}>
              <p>장바구니가 비어 있어요.</p>
              <Link to="/products">상품 보러 가기</Link>
            </div>
          )}

          <ul className={styles.list}>
            {sorted.map((item) => {
              const conflictWith = conflicts.get(item.cartKey);
              const closed = !item.isValid;

              return (
                <li
                  key={item.cartKey}
                  className={`${styles.item} ${conflictWith ? styles.conflict : ""} ${closed ? styles.closed : ""}`}
                >
                  <label className={styles.itemCheck}>
                    <input
                      type="checkbox"
                      checked={!closed && selected.has(item.cartKey)}
                      onChange={() => toggle(item.cartKey)}
                      disabled={closed}
                      aria-label={`${item.productName} 선택`}
                    />
                  </label>
                  <Link to={`/products/${item.pid}`} className={styles.imgLink}>
                    {item.thumbnail ? <img className={styles.img} src={item.thumbnail} alt={item.productName} /> : <span className={styles.img} />}
                  </Link>

                  <div className={styles.info}>
                    <div className={styles.top}>
                      <div>
                        <Link to={`/products/${item.pid}`} className={styles.name}>
                          {item.productName ?? "삭제된 상품"}
                        </Link>
                        <p className={styles.sub}>
                          {closed
                            ? [item.sellerNickname, item.location, formatTradeKey(item.tradeKey)].filter(Boolean).join(" · ")
                            : item.sellerNickname}
                        </p>
                      </div>
                      {closed && <span className={styles.closedTag}>{CART_INVALID_LABEL[item.invalidReason] ?? "주문 불가"}</span>}
                      <button type="button" className={styles.delete} onClick={() => remove([item.cartKey])}>
                        <img src={xIcon} alt="삭제" />
                      </button>
                    </div>

                    {closed ? (
                      ["PAST_TIME_BLOCK", "BOOKING_NOT_AVAILABLE", "BOOKING_CONFLICT"].includes(item.invalidReason) ? (
                        <button type="button" className={`${styles.lineBtn} ${styles.self}`} onClick={() => setEditing(item)}>
                          일정 수정하기
                        </button>
                      ) : null
                    ) : (
                      <>
                        <div className={styles.schedule}>
                          <span className={styles.place}>{item.location}</span>
                          <span className={styles.time}>{formatTradeKey(item.tradeKey)}</span>
                          <button type="button" className={styles.textBtn} onClick={() => setEditing(item)}>
                            변경
                          </button>
                        </div>
                        {conflictWith && <p className={styles.warning}>위 {conflictWith}와(과) 같은 판매자·같은 시간이에요</p>}
                        <div className={styles.bottom}>
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              className={styles.stepBtn}
                              onClick={() => changeQuantity(item, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <img src={minusIcon} alt="수량 빼기" />
                            </button>
                            <span className={styles.num}>{item.quantity}</span>
                            <button type="button" className={styles.stepBtn} onClick={() => changeQuantity(item, item.quantity + 1)}>
                              <img src={plusIcon} alt="수량 더하기" />
                            </button>
                          </div>
                          <p className={styles.price}>{formatPrice((Number(item.price) || 0) * item.quantity)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ===== 오른쪽: 정렬 + 거래 요약 ===== */}
        <aside className={styles.side}>
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <section className={styles.summary}>
            <h2 className={styles.summaryTitle}>선택한 거래 일정</h2>
            <ul className={styles.summaryList}>
              {chosen.length === 0 && <li className={styles.muted}>선택한 상품이 없어요</li>}
              {chosen.map((i) => (
                <li key={i.cartKey} className={conflicts.has(i.cartKey) ? styles.isError : ""}>
                  {shortTime(i.tradeKey)} · {i.location} · {i.productName}
                </li>
              ))}
            </ul>
            <div className={styles.total}>
              <p className={styles.muted}>
                상품 {totalCount}개 · 거래 {chosen.length}건
              </p>
              <div className={styles.priceRow}>
                <span>총 금액</span>
                <strong>{formatPrice(totalPrice)}</strong>
              </div>
              <p className={styles.muted}>결제는 거래 현장에서 직접 해요</p>
            </div>
            <button
              type="button"
              className={styles.reserve}
              onClick={reserve}
              disabled={reserving || chosen.length === 0 || conflicts.size > 0}
            >
              {reserving ? "예약 중..." : "거래 예약하기"}
            </button>
            {conflicts.size > 0 && <p className={styles.summaryError}>겹치는 거래를 해결해 주세요</p>}
            {message && (
              <p className={styles.summaryError} role="alert">
                {message}
              </p>
            )}
          </section>
        </aside>
      </div>

      {editing && (
        <ScheduleModal
          item={editing}
          onSubmit={(values) => changeSchedule(editing, values)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

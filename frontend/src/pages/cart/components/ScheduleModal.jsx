// 장바구니 거래 일정 변경 모달 — Figma: 장바구니 - 시간 변경 (거래 장소 + 거래 날짜 + 거래 시간)
//   <ScheduleModal item={장바구니 항목} onSubmit={async ({ locationId, tradeKey }) => ...} onClose={...} />
//   거래 장소는 그 상품의 판매자가 정한 장소만 (GET /products/{pid} 의 locations)
import { useEffect, useRef, useState } from "react";
import { getProduct, toLocations } from "../../../api/products";
import { toErrorMessage } from "../../../utils/validation";
import TradeTimePicker from "../../product/components/TradeTimePicker";
import pinIcon from "../../../assets/svg/pin.svg";
import chevronIcon from "../../../assets/svg/chevron-down.svg";
import checkIcon from "../../../assets/svg/check-green.svg";
import styles from "./ScheduleModal.module.css";

export default function ScheduleModal({ item, onSubmit, onClose }) {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(item.locationId);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);

  // 이 상품의 거래 장소 목록
  useEffect(() => {
    let ignore = false;
    getProduct(item.pid)
      .then((data) => !ignore && setLocations(toLocations(data?.locations)))
      .catch((err) => !ignore && setError(toErrorMessage(err)));
    return () => {
      ignore = true;
    };
  }, [item.pid]);

  // Esc 로 닫기 + 열리면 모달로 포커스 (부모가 다시 그려져도 한 번만)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const placeName = locations.find((l) => l.id === locationId)?.name ?? item.location ?? "거래 장소 선택";

  const handleDone = async (tradeKey) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({ locationId, tradeKey });
    } catch (err) {
      setError(toErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.productName} 거래 일정 변경`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <p className={styles.title}>거래 장소</p>
        <div className={styles.place}>
          <button
            type="button"
            className={`${styles.placeBtn} ${placeOpen ? styles.open : ""}`}
            onClick={() => setPlaceOpen((v) => !v)}
            aria-expanded={placeOpen}
          >
            <span className={styles.placeValue}>
              <img src={pinIcon} alt="" />
              {placeName}
            </span>
            <img className={styles.chevron} src={chevronIcon} alt="" />
          </button>
          {placeOpen && (
            <ul className={styles.options} role="listbox" aria-label="거래 장소">
              {locations.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={l.id === locationId}
                    className={`${styles.option} ${l.id === locationId ? styles.selected : ""}`}
                    onClick={() => {
                      setLocationId(l.id);
                      setPlaceOpen(false);
                    }}
                  >
                    {l.name}
                    {l.id === locationId && <img src={checkIcon} alt="" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <TradeTimePicker pid={item.pid} value={item.isValid ? item.tradeKey : ""} onDone={handleDone} inline />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
    </div>
  );
}

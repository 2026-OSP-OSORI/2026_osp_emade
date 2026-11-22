// 구매 완료 — 원본: purchase-confirm.html / Figma 구매완료
//   주소: /purchase-confirm/:id  (id = 주문 oid)
//   구매(예약) 요청이 끝난 뒤 보여 주는 안내 화면입니다.
import { Link } from "react-router-dom";
import checkIcon from "../../assets/svg/check-circle.svg";
import styles from "./PurchaseConfirm.module.css";

export default function PurchaseConfirm() {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>

        <img className={styles.icon} src={checkIcon} alt="" />
        <h1 className={styles.title}>구매가 완료되었습니다</h1>

        <div className={styles.actions}>
          <Link to="/products" className={`${styles.button} ${styles.primary}`}>
            상품 목록
          </Link>
          <Link to="/mypage/history" className={styles.button}>
            거래 내역
          </Link>
        </div>
      </main>
    </div>
  );
}

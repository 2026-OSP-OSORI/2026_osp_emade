// 상품 등록 — 원본: product-reg.html / Figma 상품 등록   (담당: 유나)
//   주소: /products/new  (로그인 필요)
//
// 들어오면 먼저 확인
//   - 로그인 안 했으면 → 로그인 화면 (로그인 후 다시 여기로)
//   - 주간 거래 시간을 안 정했으면 → alert 후 마이페이지 거래 일정으로 (팀 결정 사항)
//     ※ 상품 등록 버튼에는 hooks/useGoToProductReg 를 쓰면 버튼을 누를 때 바로 막을 수 있어요.
//
// API: POST /products (multipart) → 성공하면 상품 상세로 이동
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createProduct } from "../../api/products";
import { getMySchedule, hasWeeklySchedule } from "../../api/schedules";
import { getUserProfile } from "../../api/users";
import useAuth from "../../hooks/useAuth";
import { NO_SCHEDULE_MESSAGE, SCHEDULE_PAGE } from "../../hooks/useGoToProductReg";
import { toErrorMessage } from "../../utils/validation";
import ProductForm from "./components/ProductForm";
import styles from "./ProductFormPage.module.css";

export default function ProductReg() {
  const navigate = useNavigate();
  const { uid, isLoggedIn, isLoading } = useAuth();
  const [ready, setReady] = useState(false); // 주간 시간 확인이 끝났는지
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      navigate("/login", { replace: true, state: { from: "/products/new" } });
      return;
    }
    let ignore = false; // StrictMode 에서 alert 가 두 번 뜨지 않도록
    getMySchedule()
      .then((schedule) => {
        if (ignore) return;
        if (!hasWeeklySchedule(schedule)) {
          alert(NO_SCHEDULE_MESSAGE);
          navigate(SCHEDULE_PAGE, { replace: true });
          return;
        }
        setReady(true);
      })
      .catch(() => !ignore && setReady(true)); // 확인 실패 시 등록 자체는 막지 않음 (서버가 다시 검사)
    getUserProfile(uid)
      .then((data) => !ignore && setProfile(data))
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [isLoading, isLoggedIn, uid, navigate]);

  const handleSubmit = async (values) => {
    try {
      const data = await createProduct({
        ...values,
        images: values.images.map((img) => img.file),
        locations: values.locations.map((l) => l.name),
      });
      navigate(data?.pid ? `/products/${data.pid}` : "/mypage/myreg", { replace: true });
    } catch (err) {
      throw new Error(toErrorMessage(err));
    }
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="현재 위치">
        <Link to="/">홈</Link>
        <span>&gt;</span>
        <Link to="/mypage/myreg">판매자 센터</Link>
        <span>&gt;</span>
        <strong>상품 등록</strong>
      </nav>

      <div className={styles.pageTitle}>
        <div>
          <h1 className={styles.title}>상품 등록</h1>
          <p className={styles.sub}>판매할 작품 정보를 입력해 주세요. * 표시는 필수 항목이에요.</p>
        </div>
      </div>

      {ready ? (
        <ProductForm
          mode="create"
          sellerNickname={profile?.nickname}
          sellerImage={profile?.profileImage}
          onSubmit={handleSubmit}
        />
      ) : (
        <p className={styles.message}>확인 중...</p>
      )}
    </div>
  );
}

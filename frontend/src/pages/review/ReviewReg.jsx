// 리뷰 작성 / 수정 — 원본: review-reg.html / Figma 리뷰 작성
//   작성: /reviews/new?oid=주문ID   (거래 확정·거래 내역에서 들어옴)
//   수정: /reviews/new?rid=리뷰ID   (마이페이지 '작성한 리뷰'의 수정 버튼)
//
//   왼쪽 상품 정보는 거래 내역 확인서 API(GET /orders/{oid})의
//   thumbnail(사진), productName(상품명), tradeStartAt(구매일)을 씁니다. (API 명세 18번)
//   거래 내역 화면에서 state 로 넘겨주면 API 를 기다리지 않고 바로 보입니다.
//     navigate(`/reviews/new?oid=${oid}`, { state: { product: { name, image }, purchasedAt } })
//
//   입력 규칙 (백엔드와 같음): 별점 1~5, 제목 필수, 내용 20자 이상, 사진 최대 5장
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { createReview, getReviewDetail, updateReview } from "../../api/reviews";
import { getOrder } from "../../api/orders";
import useAuth from "../../hooks/useAuth";
import { formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/validation";
import RatingInput from "./components/RatingInput";
import PhotoUploader from "./components/PhotoUploader";
import styles from "./ReviewReg.module.css";

const MIN_CONTENT = 20;
const MAX_CONTENT = 1000;
const MAX_TITLE = 50;

// 작성 내용 검사 → 문제 있으면 문구, 없으면 ""
const validate = ({ rating, title, content }) => {
  if (rating < 1) return "*별점을 선택해주세요.";
  if (!title.trim()) return "*제목을 입력하세요.";
  if (content.trim().length < MIN_CONTENT) return `*리뷰 내용을 ${MIN_CONTENT}자 이상 입력해주세요.`;
  return "";
};

export default function ReviewReg() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, isLoading } = useAuth();

  const oid = searchParams.get("oid");
  const rid = searchParams.get("rid"); // 있으면 수정 모드
  const isEdit = Boolean(rid);

  // 왼쪽 상품 정보: { name, image, date }
  const [product, setProduct] = useState(() => {
    const state = location.state;
    if (!state?.product) return null;
    return { ...state.product, date: state.purchasedAt };
  });

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState([]); // [{ key, url, file? }]
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  // 작성 모드에서 리뷰를 쓸 수 없는 주문이면 안내 { message, reviewId }
  const [blocked, setBlocked] = useState(null);
  const [saving, setSaving] = useState(false);

  // 로그인 필요
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      navigate("/login", { replace: true, state: { from: location.pathname + location.search } });
    }
  }, [isLoading, isLoggedIn, navigate, location.pathname, location.search]);

  // 수정 모드: 기존 리뷰 불러와서 채우기
  useEffect(() => {
    if (!isEdit || !isLoggedIn) return;
    let ignore = false;
    getReviewDetail(rid)
      .then((data) => {
        if (ignore) return;
        if (!data.isMine) {
          setLoadError("*본인이 작성한 리뷰만 수정할 수 있어요.");
          return;
        }
        setRating(data.rating ?? 0);
        setTitle(data.title ?? "");
        setContent(data.content ?? "");
        setPhotos((data.images ?? []).map((url) => ({ key: url, url })));
        setProduct({ name: data.product?.name, image: data.product?.image, date: data.createdAt });
      })
      .catch((err) => !ignore && setLoadError(toErrorMessage(err)));
    return () => {
      ignore = true;
    };
  }, [isEdit, rid, isLoggedIn]);

  // 작성 모드: 거래 내역 확인서(GET /orders/{oid})로 상품 정보 + 리뷰 작성 가능 여부 확인
  //   actions.canReview 가 false 면 폼 대신 안내 (거래 미완료 · 이미 작성함)
  useEffect(() => {
    if (isEdit || !oid || !isLoggedIn) return;
    let ignore = false;
    getOrder(oid)
      .then((order) => {
        if (ignore || !order) return;
        setProduct({ name: order.productName, image: order.thumbnail, date: order.tradeStartAt });
        if (order.actions && !order.actions.canReview) {
          setBlocked(
            order.reviewId
              ? { message: "이미 리뷰를 작성한 주문이에요.", reviewId: order.reviewId }
              : { message: "거래가 완료된 주문만 리뷰를 쓸 수 있어요." },
          );
        }
      })
      .catch((err) => !ignore && setLoadError(toErrorMessage(err)));
    return () => {
      ignore = true;
    };
  }, [isEdit, oid, isLoggedIn]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const message = validate({ rating, title, content });
    if (message) {
      setError(message);
      return;
    }

    setSaving(true);
    setError("");
    const newFiles = photos.filter((photo) => photo.file).map((photo) => photo.file);
    const body = { title: title.trim(), rating, content: content.trim(), images: newFiles };

    try {
      if (isEdit) {
        const keepImages = photos.filter((photo) => !photo.file).map((photo) => photo.url);
        await updateReview(rid, { ...body, keepImages });
        navigate(`/reviews/${rid}`, { replace: true });
      } else {
        const data = await createReview({ ...body, oid });
        navigate(`/reviews/${data.rid}`, { replace: true });
      }
    } catch (err) {
      setError(toErrorMessage(err));
      setSaving(false);
    }
  };

  if (isLoading || !isLoggedIn) return null;

  if (!isEdit && !oid) {
    return <p className={styles.message}>주문 정보가 없어요. 거래 내역에서 리뷰를 작성해 주세요.</p>;
  }
  if (loadError) {
    return (
      <p className={styles.message} role="alert">
        {loadError}
      </p>
    );
  }
  if (blocked) {
    return (
      <div className={styles.message}>
        <p>{blocked.message}</p>
        {blocked.reviewId && (
          <Link to={`/reviews/${blocked.reviewId}`} className={styles.messageLink}>
            작성한 리뷰 보기
          </Link>
        )}
      </div>
    );
  }

  const contentLength = content.trim().length;

  return (
    <div className={styles.page}>
      {/* ===== 왼쪽: 구매한 상품 ===== */}
      <aside className={styles.left}>
        <h1 className={styles.pageTitle}>{isEdit ? "리뷰 수정" : "리뷰 작성"}</h1>
        <div className={styles.productImage}>{product?.image && <img src={product.image} alt="" />}</div>
        <div className={styles.productInfo}>
          <p className={styles.productName}>{product?.name ?? "구매한 상품"}</p>
          {product?.date && (
            <p className={styles.productDate}>
              {formatDate(product.date)} {isEdit ? "작성" : "구매"}
            </p>
          )}
        </div>
      </aside>

      {/* ===== 오른쪽: 작성 폼 ===== */}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <section className={styles.ratingBox}>
          <h2 className={styles.question}>상품은 어떠셨나요?</h2>
          <RatingInput
            value={rating}
            onChange={(value) => {
              setRating(value);
              setError("");
            }}
          />
        </section>

        <div className={styles.titleRow}>
          <label htmlFor="review-title" className={styles.label}>
            제목
          </label>
          <input
            id="review-title"
            className={styles.titleInput}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
            maxLength={MAX_TITLE}
            placeholder="예) 색감이 사진보다 더 예뻐요!"
          />
        </div>

        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setError("");
          }}
          maxLength={MAX_CONTENT}
          placeholder="소재감, 색감, 배송 상태 등 솔직한 후기를 남겨주세요"
          aria-label="리뷰 내용"
        />
        <p className={`${styles.count} ${contentLength >= MIN_CONTENT ? styles.countOk : ""}`}>
          {contentLength} / 최소 {MIN_CONTENT}자
        </p>

        <div className={styles.photoHead}>
          <span className={styles.label}>사진 첨부</span>
          <span className={styles.photoHint}>최대 5장</span>
        </div>
        <PhotoUploader photos={photos} onChange={setPhotos} onError={setError} />

        <div className={styles.bottom}>
          <p className={styles.error} role="alert">
            {error}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => navigate(-1)} disabled={saving}>
              취소
            </button>
            <button type="submit" className={styles.submit} disabled={saving}>
              {saving ? "저장 중..." : isEdit ? "수정하기" : "등록하기"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

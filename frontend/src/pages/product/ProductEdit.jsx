// 상품 수정 — 원본: product-edit.html / Figma 상품 수정   (담당: 유나)
//   주소: /products/:id/edit  (로그인 필요, 판매자 본인만)
//
// API
//   GET    /products/{pid}  판매자 본인이면 stock, pendingDelete 가 같이 옴
//   PATCH  /products/{pid}  바꾼 값만 보냄 (사진·장소는 남길 것/추가/삭제로)
//   DELETE /products/{pid}  진행 중인 거래가 있으면 '삭제 대기'
//   삭제 대기 상품은 수정할 수 없어요 (409 PRODUCT_PENDING_DELETE).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteProduct, getProduct, toLocations, updateProduct } from "../../api/products";
import useAuth from "../../hooks/useAuth";
import { formatDate } from "../../utils/format";
import { toErrorMessage } from "../../utils/validation";
import ProductForm from "./components/ProductForm";
import styles from "./ProductFormPage.module.css";

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export default function ProductEdit() {
  const { id: pid } = useParams();
  const navigate = useNavigate();
  const { uid, isLoggedIn, isLoading } = useAuth();
  const [result, setResult] = useState({ pid: null, product: null, error: "" });

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) {
      navigate("/login", { replace: true, state: { from: `/products/${pid}/edit` } });
      return;
    }
    let ignore = false;
    getProduct(pid)
      .then((data) => !ignore && setResult({ pid, product: data, error: "" }))
      .catch((err) => !ignore && setResult({ pid, product: null, error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [pid, isLoading, isLoggedIn, navigate]);

  const product = result.pid === pid ? result.product : null;
  const sellerId = product?.seller?.uid ?? product?.sellerId;
  let blocked = result.pid === pid ? result.error : "";
  if (product && sellerId !== uid) blocked = "*내가 등록한 상품만 수정할 수 있어요.";
  if (product?.pendingDelete) blocked = "*삭제 대기 중인 상품은 수정할 수 없어요.";

  const initial = product && {
    ...product,
    tags: Array.isArray(product.tags) ? product.tags : Object.keys(product.tags ?? {}),
    locations: toLocations(product.locations),
  };

  // 폼 값 → 바뀐 것만 PATCH
  const handleSubmit = async (values) => {
    const changes = {};
    ["name", "description", "category", "price", "stock"].forEach((field) => {
      if (values[field] !== initial[field]) changes[field] = values[field];
    });
    // 폼은 판매중/판매 중단 두 가지 (일시 품절은 재고 0인 판매중)
    if (values.status !== (initial.status === "ENDED" ? "ENDED" : "ON_SALE")) changes.status = values.status;
    if (!sameList(values.tags, initial.tags)) changes.tags = values.tags;

    const kept = values.images.filter((img) => !img.file).map((img) => img.url);
    const added = values.images.filter((img) => img.file).map((img) => img.file);
    if (added.length || !sameList(kept, initial.images ?? [])) {
      changes.keepImages = kept;
      changes.images = added;
    }

    const keptIds = new Set(values.locations.filter((l) => l.id).map((l) => l.id));
    const removeLocationIds = initial.locations.filter((l) => !keptIds.has(l.id)).map((l) => l.id);
    const addLocations = values.locations.filter((l) => !l.id).map((l) => l.name);
    if (removeLocationIds.length) changes.removeLocationIds = removeLocationIds;
    if (addLocations.length) changes.addLocations = addLocations;

    if (Object.keys(changes).length === 0) {
      navigate(`/products/${pid}`);
      return;
    }
    try {
      await updateProduct(pid, changes);
      navigate(`/products/${pid}`, { replace: true });
    } catch (err) {
      throw new Error(toErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProduct(pid);
      navigate("/mypage/myreg", { replace: true });
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
        <strong>상품 수정</strong>
      </nav>

      <div className={styles.pageTitle}>
        <div>
          <h1 className={styles.title}>상품 수정</h1>
          <p className={styles.sub}>등록한 작품 정보를 수정할 수 있어요. 저장하면 바로 반영돼요.</p>
        </div>
        {product?.createdAt && (
          <p className={styles.date}>
            등록일 {formatDate(product.createdAt)}
            {product.updatedAt && ` · 최근 수정 ${formatDate(product.updatedAt)}`}
          </p>
        )}
      </div>

      {blocked ? (
        <div className={styles.message}>
          <p>{blocked}</p>
          <Link to={`/products/${pid}`}>상품 상세로</Link>
        </div>
      ) : product ? (
        <ProductForm
          key={pid}
          mode="edit"
          initial={initial}
          sellerNickname={product.seller?.nickname ?? product.sellerNickname}
          sellerImage={product.seller?.image ?? product.sellerImage}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      ) : (
        <p className={styles.message}>불러오는 중...</p>
      )}
    </div>
  );
}

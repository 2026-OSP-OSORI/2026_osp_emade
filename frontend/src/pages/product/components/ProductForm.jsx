// 상품 등록 · 수정 공통 폼 — 원본: product-reg.html / product-edit.html
//   <ProductForm mode="create" onSubmit={async (values) => ...} />
//   <ProductForm mode="edit" initial={상품} onSubmit={...} onDelete={...} />
//
// onSubmit 으로 넘기는 값
//   { name, category(KNITTING 등), price, stock, description, tags: [],
//     images: [{ url } | { file }] (화면 순서), locations: [{ id?, name }], status }
//   → 등록/수정 페이지에서 API 모양으로 바꿔서 보냅니다.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../../components/Card/Card";
import { CATEGORIES, CATEGORY_CODES } from "../../../constants/categories";
import styles from "./ProductForm.module.css";

const MAX_IMAGES = 10;
const MAX_NAME = 40;
const MAX_DESC = 2000;
const MAX_TAGS = 5;
const EMPTY_SLOTS = 4; // 사진 추가 칸 옆 빈 칸 수 (원본 디자인)

// Firebase 키에 못 쓰는 글자 (백엔드 is_valid_key) — 태그에 들어가면 저장 실패
const INVALID_TAG = /[.#$[\]/]/;

const onlyDigits = (text) => text.replace(/[^\d]/g, "");
const withComma = (digits) => (digits === "" ? "" : Number(digits).toLocaleString());

let nextId = 0;
const newId = () => `new-${(nextId += 1)}`;

export default function ProductForm({ mode, initial, sellerNickname, sellerImage, onSubmit, onDelete }) {
  const isEdit = mode === "edit";
  const navigate = useNavigate();

  // ---------- 입력값 ----------
  const [images, setImages] = useState(() =>
    (initial?.images ?? []).map((url) => ({ id: url, url })),
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [stock, setStock] = useState(initial?.stock != null ? String(initial.stock) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [locations, setLocations] = useState(initial?.locations ?? []); // [{ id?, name }]
  const [placeText, setPlaceText] = useState("");
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [tagText, setTagText] = useState("");
  const [status, setStatus] = useState(initial?.status === "ENDED" ? "ENDED" : "ON_SALE");

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 새로 고른 사진 미리보기 주소는 화면을 떠날 때 정리
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => imagesRef.current.forEach((img) => img.file && URL.revokeObjectURL(img.url)),
    [],
  );

  const clearError = (field) => setErrors((prev) => ({ ...prev, [field]: "" }));

  // ---------- 사진 ----------
  const addImages = (fileList) => {
    const room = MAX_IMAGES - images.length;
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (files.length > room) setErrors((prev) => ({ ...prev, images: `*사진은 최대 ${MAX_IMAGES}장까지 등록할 수 있어요.` }));
    else clearError("images");
    const added = files.slice(0, room).map((file) => ({ id: newId(), file, url: URL.createObjectURL(file) }));
    // 서버는 '남긴 기존 사진 → 새 사진' 순서로 저장하므로 화면도 같은 순서로
    setImages((prev) => [...prev, ...added]);
  };

  const removeImage = (id) =>
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.file) URL.revokeObjectURL(target.url);
      return prev.filter((img) => img.id !== id);
    });

  // ---------- 거래 장소 ----------
  const addPlace = () => {
    const text = placeText.trim();
    if (!text) return;
    if (locations.some((l) => l.name === text)) {
      setErrors((prev) => ({ ...prev, locations: "*이미 추가한 장소예요." }));
      return;
    }
    setLocations((prev) => [...prev, { name: text }]);
    setPlaceText("");
    clearError("locations");
  };

  // ---------- 태그 ----------
  const addTag = () => {
    const text = tagText.trim().replace(/^#+/, "");
    if (!text) return;
    let error = "";
    if (tags.length >= MAX_TAGS) error = `*태그는 최대 ${MAX_TAGS}개까지 등록할 수 있어요.`;
    else if (INVALID_TAG.test(text)) error = "*태그에는 . # $ [ ] / 를 쓸 수 없어요.";
    else if (tags.includes(text)) error = "*이미 추가한 태그예요.";
    if (error) {
      setErrors((prev) => ({ ...prev, tags: error }));
      return;
    }
    setTags((prev) => [...prev, text]);
    setTagText("");
    clearError("tags");
  };

  // ---------- 제출 ----------
  const validate = () => {
    const next = {};
    if (images.length === 0) next.images = "*상품 사진을 1장 이상 등록해 주세요.";
    if (!name.trim()) next.name = "*상품명을 입력해 주세요.";
    if (!category) next.category = "*카테고리를 선택해 주세요.";
    if (price === "") next.price = "*판매 가격을 입력해 주세요.";
    if (stock === "") next.stock = "*재고 수량을 입력해 주세요.";
    else if (!isEdit && Number(stock) < 1) next.stock = "*재고는 1개 이상으로 등록해 주세요.";
    if (locations.length === 0) next.locations = "*거래 장소를 한 곳 이상 추가해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        price: Number(price),
        stock: Number(stock),
        description: description.trim(),
        tags,
        images,
        locations,
        status,
      });
    } catch (err) {
      setFormError(err?.message ?? "*저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("상품을 삭제할까요?\n진행 중인 거래가 있으면 거래가 끝난 뒤 삭제돼요.")) return;
    setSubmitting(true);
    try {
      await onDelete();
    } catch (err) {
      setFormError(err?.message ?? "*삭제하지 못했어요.");
      setSubmitting(false);
    }
  };

  const categoryName = Object.keys(CATEGORY_CODES).find((label) => CATEGORY_CODES[label] === category) ?? "";
  const preview = {
    pid: "preview",
    name: name.trim() || "상품명",
    price: Number(price) || 0,
    image: images[0]?.url,
    sellerNickname: sellerNickname || "작가이름",
    sellerImage,
    isLiked: false,
  };

  return (
    <form className={styles.columns} onSubmit={handleSubmit} noValidate>
      {/* ===== 왼쪽: 입력 폼 ===== */}
      <div className={styles.form}>
        {/* 상품 이미지 */}
        <section className={styles.box}>
          <div className={styles.boxHead}>
            <h2 className={styles.boxTitle}>상품 이미지</h2>
            <p className={styles.boxDesc}>최대 {MAX_IMAGES}장까지 등록할 수 있어요. 첫 번째 사진이 대표 이미지로 보여요.</p>
          </div>
          <ul className={styles.imageList}>
            <li>
              <label className={`${styles.upload} ${images.length >= MAX_IMAGES ? styles.uploadFull : ""}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={images.length >= MAX_IMAGES}
                  onChange={(e) => {
                    addImages(e.target.files);
                    e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
                  }}
                />
                <span className={styles.uploadPlus}>+</span>
                <span>사진 추가</span>
                <span>
                  {images.length}/{MAX_IMAGES}
                </span>
              </label>
            </li>
            {images.map((img, i) => (
              <li key={img.id} className={styles.imageItem}>
                <img src={img.url} alt={`상품 사진 ${i + 1}`} />
                {i === 0 && <span className={styles.badge}>대표</span>}
                <button type="button" className={styles.imageDelete} onClick={() => removeImage(img.id)} aria-label="사진 삭제">
                  ×
                </button>
              </li>
            ))}
            {Array.from({ length: Math.max(0, EMPTY_SLOTS - images.length) }, (_, i) => (
              <li key={`slot-${i}`} className={styles.imageSlot} />
            ))}
          </ul>
          {errors.images && <p className={styles.error}>{errors.images}</p>}
        </section>

        {/* 기본 정보 */}
        <section className={styles.box}>
          <div className={styles.boxHead}>
            <h2 className={styles.boxTitle}>기본 정보</h2>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="product-name">
              상품명<span className={styles.required}>*</span>
            </label>
            <input
              className={`${styles.input} ${errors.name ? styles.invalid : ""}`}
              id="product-name"
              type="text"
              maxLength={MAX_NAME}
              placeholder="상품명을 입력해 주세요"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
            />
            <p className={errors.name ? styles.error : styles.help}>
              {errors.name || `${name.length} / ${MAX_NAME}자`}
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="product-category">
              카테고리<span className={styles.required}>*</span>
            </label>
            <select
              className={`${styles.input} ${styles.select} ${!category ? styles.placeholder : ""} ${errors.category ? styles.invalid : ""}`}
              id="product-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                clearError("category");
              }}
            >
              <option value="" disabled hidden>
                카테고리를 선택해 주세요
              </option>
              {CATEGORIES.map((label) => (
                <option key={label} value={CATEGORY_CODES[label]}>
                  {label}
                </option>
              ))}
            </select>
            {errors.category && <p className={styles.error}>{errors.category}</p>}
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="product-price">
                판매 가격<span className={styles.required}>*</span>
              </label>
              <div className={styles.unitInput}>
                <input
                  className={`${styles.input} ${errors.price ? styles.invalid : ""}`}
                  id="product-price"
                  inputMode="numeric"
                  placeholder="0"
                  value={withComma(price)}
                  onChange={(e) => {
                    setPrice(onlyDigits(e.target.value).slice(0, 9));
                    clearError("price");
                  }}
                />
                <span>원</span>
              </div>
              {errors.price && <p className={styles.error}>{errors.price}</p>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="product-stock">
                재고 수량<span className={styles.required}>*</span>
              </label>
              <div className={styles.unitInput}>
                <input
                  className={`${styles.input} ${errors.stock ? styles.invalid : ""}`}
                  id="product-stock"
                  inputMode="numeric"
                  placeholder="0"
                  value={stock}
                  onChange={(e) => {
                    setStock(onlyDigits(e.target.value).slice(0, 5));
                    clearError("stock");
                  }}
                />
                <span>개</span>
              </div>
              {errors.stock && <p className={styles.error}>{errors.stock}</p>}
            </div>
          </div>
        </section>

        {/* 상품 설명 */}
        <section className={styles.box}>
          <div className={styles.boxHead}>
            <h2 className={styles.boxTitle}>상품 설명</h2>
            <p className={styles.boxDesc}>소재, 크기, 제작 과정 등을 자세히 적어 주세요.</p>
          </div>
          <div className={styles.textarea}>
            <textarea
              maxLength={MAX_DESC}
              placeholder="예) 직접 손으로 뜬 곰돌이 인형 키링이에요. 크기는 약 8cm이고, 부드러운 면사를 사용했어요."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="상품 설명"
            />
            <p className={styles.count}>
              {description.length} / {MAX_DESC}
            </p>
          </div>
        </section>

        {/* 거래 정보 */}
        <section className={styles.box}>
          <div className={styles.boxHead}>
            <h2 className={styles.boxTitle}>거래 정보</h2>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="place-input">
              거래 장소<span className={styles.required}>*</span>
            </label>
            <div className={styles.placeAdd}>
              <input
                className={`${styles.input} ${errors.locations ? styles.invalid : ""}`}
                id="place-input"
                type="text"
                maxLength={50}
                placeholder="추가할 거래 장소를 입력하세요"
                value={placeText}
                onChange={(e) => setPlaceText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addPlace();
                  }
                }}
              />
              <button type="button" className={styles.placeAddBtn} onClick={addPlace}>
                추가
              </button>
            </div>
            {errors.locations && <p className={styles.error}>{errors.locations}</p>}
            {locations.length > 0 && (
              <ul className={styles.placeList}>
                {locations.map((l) => (
                  <li key={l.id ?? l.name} className={styles.placeItem}>
                    <span className={styles.placeName}>{l.name}</span>
                    <button
                      type="button"
                      className={styles.placeDelete}
                      onClick={() => setLocations((prev) => prev.filter((p) => p !== l))}
                      aria-label={`${l.name} 삭제`}
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.help}>여러 곳을 추가할 수 있어요. 거래는 이화여대 캠퍼스 안 공개된 장소에서만 가능해요.</p>
            <p className={styles.help}>구매자와 메시지를 주고받을 수 없어요. 만날 위치를 최대한 자세히 적어 주세요.</p>
          </div>
        </section>

        {/* 검색 태그 */}
        <section className={styles.box}>
          <div className={styles.boxHead}>
            <h2 className={styles.boxTitle}>검색 태그</h2>
            <p className={styles.boxDesc}>구매자가 검색할 때 쓰는 키워드예요. 최대 {MAX_TAGS}개까지 등록할 수 있어요.</p>
          </div>
          <input
            className={styles.input}
            type="text"
            maxLength={20}
            placeholder="태그를 입력하고 Enter를 눌러 주세요"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault(); // 폼 제출 막기
                addTag();
              }
            }}
            aria-label="검색 태그"
          />
          {errors.tags && <p className={styles.error}>{errors.tags}</p>}
          {tags.length > 0 && (
            <ul className={styles.tagList}>
              {tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  #{tag}
                  <button type="button" onClick={() => setTags((prev) => prev.filter((t) => t !== tag))} aria-label={`${tag} 태그 삭제`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ===== 오른쪽: 판매 상태 · 미리보기 · 안내 ===== */}
      <aside className={styles.side}>
        {isEdit && (
          <section className={`${styles.box} ${styles.boxSide}`}>
            <h2 className={styles.boxTitle}>판매 상태</h2>
            <div className={styles.status}>
              <label className={styles.radio}>
                <input type="radio" name="status" checked={status === "ON_SALE"} onChange={() => setStatus("ON_SALE")} />
                판매중
              </label>
              <label className={styles.radio}>
                <input type="radio" name="status" checked={status === "ENDED"} onChange={() => setStatus("ENDED")} />
                판매 중단
              </label>
            </div>
            {status === "ON_SALE" && Number(stock) === 0 && stock !== "" && (
              <p className={styles.help}>재고가 0개라서 '일시 품절'로 보여요.</p>
            )}
          </section>
        )}

        {/* 판매 현황 — 상세 응답에 숫자가 있을 때만 (명세에는 아직 없음) */}
        {isEdit && (initial?.viewCount != null || initial?.likeCount != null || initial?.soldCount != null) && (
          <section className={`${styles.box} ${styles.boxSide}`}>
            <h2 className={styles.boxTitle}>판매 현황</h2>
            <ul className={styles.stats}>
              {initial.viewCount != null && (
                <li>
                  <strong>{Number(initial.viewCount).toLocaleString()}</strong>
                  <span>조회</span>
                </li>
              )}
              <li>
                <strong>{Number(initial.likeCount ?? 0).toLocaleString()}</strong>
                <span>찜</span>
              </li>
              <li>
                <strong>{Number(initial.soldCount ?? 0).toLocaleString()}</strong>
                <span>판매</span>
              </li>
            </ul>
          </section>
        )}

        <section className={`${styles.box} ${styles.boxSide}`}>
          <h2 className={styles.boxTitle}>미리보기</h2>
          <p className={styles.boxDesc}>
            상품 목록에서 이렇게 보여요.{categoryName && ` (${categoryName})`}
          </p>
          {/* 미리보기 카드는 눌러도 이동하지 않게 */}
          <div className={styles.preview} inert>
            <Card product={preview} onLikeChange={() => {}} />
          </div>
        </section>

        {!isEdit && (
          <section className={`${styles.box} ${styles.boxSide}`}>
            <h2 className={styles.boxTitle}>등록 전 확인해 주세요</h2>
            <ul className={styles.tips}>
              <li>대표 사진은 작품이 잘 보이는 밝은 사진이 좋아요.</li>
              <li>가격은 재료비와 제작 시간을 함께 고려해 주세요.</li>
              <li>등록한 상품은 판매자 센터에서 다시 수정할 수 있어요.</li>
            </ul>
          </section>
        )}
      </aside>

      {/* ===== 하단 버튼 ===== */}
      <div className={styles.actionBar}>
        {isEdit && (
          <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={handleDelete} disabled={submitting}>
            상품 삭제
          </button>
        )}
        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}
        <div className={styles.actionRight}>
          <button type="button" className={`${styles.btn} ${styles.gray}`} onClick={() => navigate(-1)} disabled={submitting}>
            취소
          </button>
          <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={submitting}>
            {submitting ? "저장 중..." : isEdit ? "수정 완료" : "등록하기"}
          </button>
        </div>
      </div>
    </form>
  );
}

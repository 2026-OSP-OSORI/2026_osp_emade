// 사진 첨부 (최대 5장) — 기존 사진(URL)과 새로 고른 사진(File)을 함께 다룹니다.
//   photos: [{ key, url, file? }]   file 이 있으면 새 사진, 없으면 기존 사진
//   onChange(nextPhotos)
import { useEffect, useRef } from "react";
import cameraIcon from "../../../assets/svg/camera.svg";
import closeIcon from "../../../assets/svg/close-circle.svg";
import styles from "./PhotoUploader.module.css";

export const MAX_PHOTOS = 5;

let nextKey = 0;

export default function PhotoUploader({ photos, onChange, onError }) {
  const inputRef = useRef(null);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // 화면을 떠날 때 미리보기용 주소 정리 (메모리 누수 방지)
  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => photo.file && URL.revokeObjectURL(photo.url));
    },
    [],
  );

  const handleSelect = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 사진을 다시 골라도 선택되게

    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length < files.length) onError?.("*이미지 파일만 올릴 수 있어요.");

    const room = MAX_PHOTOS - photos.length;
    if (images.length > room) onError?.(`*사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);

    const added = images.slice(0, Math.max(room, 0)).map((file) => ({
      key: `new-${nextKey++}`,
      url: URL.createObjectURL(file),
      file,
    }));
    if (added.length) onChange([...photos, ...added]);
  };

  const remove = (key) => {
    const target = photos.find((photo) => photo.key === key);
    if (target?.file) URL.revokeObjectURL(target.url);
    onChange(photos.filter((photo) => photo.key !== key));
  };

  const full = photos.length >= MAX_PHOTOS;

  return (
    <ul className={styles.list}>
      <li>
        <button
          type="button"
          className={styles.add}
          onClick={() => inputRef.current?.click()}
          disabled={full}
          aria-label="사진 추가"
        >
          <img src={cameraIcon} alt="" />
          <span>
            {photos.length}/{MAX_PHOTOS}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleSelect}
        />
      </li>

      {photos.map((photo, i) => (
        <li key={photo.key} className={styles.item}>
          <img src={photo.url} alt={`첨부 사진 ${i + 1}`} />
          <button
            type="button"
            className={styles.remove}
            onClick={() => remove(photo.key)}
            aria-label={`첨부 사진 ${i + 1} 삭제`}
          >
            <img src={closeIcon} alt="" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// 공통 푸터 — 로고, 소개 문구, 하단 링크를 담당합니다. 수정 시 팀 공유 필수
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

// TODO: 이용약관 / 개인정보처리방침 / 문의 페이지가 생기면 경로를 연결해 주세요.
const FOOTER_LINKS = [
  { label: "이용약관", href: "#" },
  { label: "개인정보처리방침", href: "#" },
  { label: "문의", href: "#" },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          Emade
        </Link>
        <p className={styles.tagline}>이화여자대학교 벗들의 핸드메이드 마켓</p>
        <div className={styles.links}>
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.label}>
              {i > 0 && <span className={styles.dot}> · </span>}
              <a href={link.href}>{link.label}</a>
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

// 공통 레이아웃 — 모든 페이지의 바깥 틀(헤더, 본문 너비, 푸터)을 담당합니다. 수정 시 팀 공유 필수
import { Outlet } from 'react-router-dom';
import Header from '../Header/Header';
import Footer from '../Footer/Footer';
import styles from './Layout.module.css';

export default function Layout() {
  return (
    <div className={styles.wrapper}>
      <Header />
      <main className={styles.main}>
        <Outlet /> {/* 각 페이지가 들어가는 자리 */}
      </main>
      <Footer />
    </div>
  );
}

// 라우팅 — URL 에 맞는 페이지 컴포넌트를 보여줍니다.
// 페이지를 추가/삭제하면 여기도 같이 수정해 주세요.
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout/Layout";

// home (윤영)
import Home from "./pages/home/Home";

// auth (윤영)
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";

// product (유나)
import ProductList from "./pages/product/ProductList";
import ProductReg from "./pages/product/ProductReg";
import ProductDetail from "./pages/product/ProductDetail";
import ProductEdit from "./pages/product/ProductEdit";

// review (윤영)
import ReviewList from "./pages/review/ReviewList";
import ReviewReg from "./pages/review/ReviewReg";
import ReviewDetail from "./pages/review/ReviewDetail";

// mypage (채윤)
import MypageInfo from "./pages/mypage/MypageInfo";
import MypageSchedule from "./pages/mypage/MypageSchedule";
import MypageWishlist from "./pages/mypage/MypageWishlist";
import MypageMyreg from "./pages/mypage/MypageMyreg";
import MypageReview from "./pages/mypage/MypageReview";
import MypageHistory from "./pages/mypage/MypageHistory";
import TradeStatement from "./pages/mypage/TradeStatement";

// purchase-confirm, trade-confirm (윤영)
import PurchaseConfirm from "./pages/purchase-confirm/PurchaseConfirm";
import TradeConfirm from "./pages/trade-confirm/TradeConfirm";

// ranking, cart, seller (유나)
import Ranking from "./pages/ranking/Ranking";
import Cart from "./pages/cart/Cart";
import SellerProducts from "./pages/seller/SellerProducts";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 모든 페이지는 Layout(Header + 본문 + Footer) 안에 들어갑니다 */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* 검색 결과: /products?q=검색어 */}
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/new" element={<ProductReg />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/products/:id/edit" element={<ProductEdit />} />

          <Route path="/reviews" element={<ReviewList />} />
          <Route path="/reviews/new" element={<ReviewReg />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />

          {/* 마이페이지 — 사이드 메뉴는 각 페이지에서
              mypage/components/SideMenu 를 직접 불러와 사용합니다. */}
          <Route path="/mypage" element={<MypageInfo />} />
          <Route path="/mypage/schedule" element={<MypageSchedule />} />
          <Route path="/mypage/wishlist" element={<MypageWishlist />} />
          <Route path="/mypage/myreg" element={<MypageMyreg />} />
          <Route path="/mypage/review" element={<MypageReview />} />
          <Route path="/mypage/history" element={<MypageHistory />} />
          <Route path="/mypage/history/:id" element={<TradeStatement />} />

          <Route path="/purchase-confirm/:id" element={<PurchaseConfirm />} />
          <Route path="/trade-confirm/:id" element={<TradeConfirm />} />

          <Route path="/ranking" element={<Ranking />} />
          <Route path="/cart" element={<Cart />} />
          <Route
            path="/sellers/:sellerId/products"
            element={<SellerProducts />}
          />

          <Route path="*" element={<p>페이지를 찾을 수 없습니다.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

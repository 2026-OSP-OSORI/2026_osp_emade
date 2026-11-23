// 상품 목록 불러오기 (GET /products, 커서 방식) — 상품 목록 · 판매자별 상품에서 사용
//   const { products, loading, error, hasMore, loadMore } = useProductList({ query, category, sellerId, sort }, 20);
//   조건(params)이 바뀌면 처음부터 다시 불러오고, loadMore() 는 nextCursor 로 다음 묶음을 이어 붙입니다.
import { useCallback, useEffect, useState } from "react";
import { getProducts, toCardProduct, toProductList } from "../api/products";
import { toErrorMessage } from "../utils/validation";

export default function useProductList(params, limit = 20) {
  const key = JSON.stringify(params); // 조건이 같으면 다시 부르지 않도록 문자열로 비교
  const [state, setState] = useState({ key: null, products: [], nextCursor: null, error: "" });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let ignore = false;
    getProducts({ ...JSON.parse(key), limit })
      .then((data) => {
        if (ignore) return;
        const { list, nextCursor } = toProductList(data);
        setState({ key, products: list.map(toCardProduct), nextCursor, error: "" });
      })
      .catch((err) => !ignore && setState({ key, products: [], nextCursor: null, error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [key, limit]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getProducts({ ...JSON.parse(key), limit, cursor: state.nextCursor });
      const { list, nextCursor } = toProductList(data);
      setState((prev) =>
        prev.key === key ? { ...prev, products: [...prev.products, ...list.map(toCardProduct)], nextCursor } : prev,
      );
    } catch (err) {
      setState((prev) => ({ ...prev, error: toErrorMessage(err) }));
    } finally {
      setLoadingMore(false);
    }
  }, [key, limit, state.nextCursor, loadingMore]);

  return {
    products: state.key === key ? state.products : [],
    loading: state.key !== key, // 조건이 바뀌고 아직 응답 전
    loadingMore,
    error: state.key === key ? state.error : "",
    hasMore: state.key === key && Boolean(state.nextCursor),
    loadMore,
  };
}

// 페이지 번호 방식 (상품 목록 — Figma 하단 < 1 2 3 >)
//   명세가 커서 방식이라, 지나간 페이지의 커서를 기억해 두고 번호로 오갈 수 있게 합니다.
//   전체 개수를 모르기 때문에 '지금까지 알게 된 페이지 + 다음 페이지가 있으면 1' 까지만 번호가 보여요.
//   const { products, loading, error, page, totalPages, setPage } = useProductPages(params, 20);
export function useProductPages(params, limit = 20) {
  const key = JSON.stringify(params);
  const [pager, setPager] = useState({ key, page: 1, cursors: [null] }); // cursors[i] = i+1 페이지 커서
  const [result, setResult] = useState({ id: null, products: [], error: "" });

  // 조건이 바뀌면 1페이지부터
  const current = pager.key === key ? pager : { key, page: 1, cursors: [null] };
  const { page, cursors } = current;
  const cursor = cursors[page - 1];
  const id = `${key}|${page}`;

  useEffect(() => {
    let ignore = false;
    getProducts({ ...JSON.parse(key), limit, cursor })
      .then((data) => {
        if (ignore) return;
        const { list, nextCursor } = toProductList(data);
        setResult({ id, products: list.map(toCardProduct), error: "" });
        // 다음 페이지 커서 기억
        setPager((prev) => {
          const base = prev.key === key ? prev : { key, page, cursors: [null] };
          if (!nextCursor || base.cursors.length > page) return base;
          return { ...base, cursors: [...base.cursors, nextCursor] };
        });
      })
      .catch((err) => !ignore && setResult({ id, products: [], error: toErrorMessage(err) }));
    return () => {
      ignore = true;
    };
  }, [key, limit, cursor, id, page]);

  return {
    products: result.id === id ? result.products : [],
    loading: result.id !== id,
    error: result.id === id ? result.error : "",
    page,
    totalPages: cursors.length,
    setPage: (next) => setPager({ ...current, page: next }),
  };
}

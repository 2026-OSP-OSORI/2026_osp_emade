// 최근 검색어 — 브라우저(localStorage)에 저장해서 새로고침해도 남아 있습니다.
// 사용법: const { recentSearches, addRecent, removeRecent, clearRecent } = useRecentSearches();
//   recentSearches  [{ term, date }] 최신순 (SearchBar 의 recentSearches 에 그대로 넘기면 됨)
//   addRecent(term) 검색할 때 호출 — 같은 검색어는 맨 앞으로 올라갑니다.
import { useCallback, useState } from "react";

const STORAGE_KEY = "emade:recentSearches";
const MAX_COUNT = 10;

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const save = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 저장 공간이 막혀 있어도(시크릿 모드 등) 화면은 그대로 동작
  }
};

// 11.19 형식
const today = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export default function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState(load);

  const update = useCallback((makeNext) => {
    setRecentSearches((prev) => {
      const next = makeNext(prev);
      save(next);
      return next;
    });
  }, []);

  const addRecent = useCallback(
    (term) =>
      update((prev) =>
        [{ term, date: today() }, ...prev.filter((item) => item.term !== term)].slice(0, MAX_COUNT),
      ),
    [update],
  );

  const removeRecent = useCallback(
    (term) => update((prev) => prev.filter((item) => item.term !== term)),
    [update],
  );

  const clearRecent = useCallback(() => update(() => []), [update]);

  return { recentSearches, addRecent, removeRecent, clearRecent };
}

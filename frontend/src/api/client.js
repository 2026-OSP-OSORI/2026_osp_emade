// client.js — 모든 Flask API 호출이 거치는 공통 함수
//
// - 개발 중에는 vite.config.js 프록시가 /api 요청을 Flask(5000번 포트)로 넘겨줍니다.
// - 성공 응답: { "success": true,  "data": { ... } }                       → data 만 돌려줌
// - 실패 응답: { "success": false, "error": { "code": "...", "message": "..." } } → 에러를 던짐
//   (backend/utils/response.py 형식)
// - 로그인은 Flask 세션(쿠키) 방식 → credentials: 'include' 로 쿠키를 함께 보냅니다.

const BASE_URL = "/api";

export async function request(path, { method = "GET", body, headers } = {}) {
  const isFormData = body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    // 이미지 업로드(FormData)는 그대로, 나머지는 JSON 으로 변환
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    const error = new Error(
      json?.error?.message || `요청 실패 (${res.status})`,
    );
    error.status = res.status; // 401: 로그인 필요, 403: 권한 없음, 404: 없음 등
    error.code = json?.error?.code; // 예: 'LOGIN_REQUIRED'
    throw error;
  }

  return json?.data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path, body) => request(path, { method: "DELETE", body }),
};

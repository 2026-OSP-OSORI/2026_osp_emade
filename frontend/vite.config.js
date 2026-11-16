import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 중 /api 로 시작하는 요청은 Flask(5000번 포트)로 전달
    // → 프론트에서 CORS 설정 없이 fetch('/api/...') 로 호출 가능
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})

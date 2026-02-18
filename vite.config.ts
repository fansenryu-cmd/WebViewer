import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 상대 경로로 하면 로컬 preview / 파일 열기 / GitHub Pages 모두 동작
  base: mode === 'production' ? './' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  optimizeDeps: {
    // sql.js 브라우저 빌드는 CJS라 ESM default export 없음 → pre-bundle로 변환
    include: ['sql.js'],
  },
  server: {
    port: 5173,
  },
}));

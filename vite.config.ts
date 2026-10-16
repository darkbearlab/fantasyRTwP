import { defineConfig } from 'vite';

// base 用相對路徑，讓 GitHub Pages 子路徑（/fantasyRTwP/）也能正確載入資源
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);

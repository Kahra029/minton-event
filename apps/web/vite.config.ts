/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // dev では /api を wrangler dev（apps/api）へ転送し、同一オリジンで Session Cookie を使う。
      // changeOrigin: false で Host（localhost:5173）を保つ（api 側の https 判定・URL 生成が Client のオリジン基準になる）
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});

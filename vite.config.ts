/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Local orbital-data server (server/index.ts): Space-Track, N2YO, CelesTrak with secrets kept server-side.
      '/api/orbital': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      // Dev-only proxy so the browser can reach CelesTrak without CORS issues (SPEC §4.2).
      '/celestrak': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/celestrak/, ''),
      },
    },
  },
  preview: {
    proxy: { '/api/orbital': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  // satellite.js 7 ships an optional WASM build that spawns ES-module workers
  // with top-level await; Vite must emit workers as ES modules (DECISIONS D16).
  build: {
    // three.js + drei form a ~1.1 MB vendor bundle; expected for a WebGL app.
    chunkSizeWarningLimit: 1400,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});

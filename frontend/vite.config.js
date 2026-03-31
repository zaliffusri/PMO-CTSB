import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': { target: 'http://localhost:3001', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  // Same as dev: without this, `vite preview` and local static servers return 404 for /api/*
  preview: { port: 4173, proxy: apiProxy },
});

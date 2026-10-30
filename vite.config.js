import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.API_PORT || '3001';
const apiProxy = {
  '/api': {
    target: `http://localhost:${apiPort}`,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host);
        proxyReq.setHeader('x-forwarded-proto', 'http');
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  // Same as dev: without this, `vite preview` and local static servers return 404 for /api/*
  preview: { port: 4173, proxy: apiProxy },
});

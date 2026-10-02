import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // 127.0.0.1, not "localhost": on Node 18+ "localhost" can resolve to IPv6 (::1)
        // while the API listens on IPv4, which makes the proxy fail with ECONNREFUSED.
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});

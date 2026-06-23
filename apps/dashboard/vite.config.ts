import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const BACKEND = process.env.HAVEN_BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        ws: false,
      },
      '/attachments': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});

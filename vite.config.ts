import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The admin API lives in the shared backend (../backend), under /api/admin only.
  const backendUrl = env.BACKEND_URL || 'http://localhost:4000';
  const proxy = { '/api/admin': { target: backendUrl, changeOrigin: false } };
  return {
    plugins: [react(), tailwindcss()],
    server: { host: '0.0.0.0', port: 3100, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: Number(env.PORT) || 3100, proxy },
  };
});

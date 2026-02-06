import { URL, fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [devtools(), tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact(), tailwindcss(), visualizer({ gzipSize: true, brotliSize: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks: {
          'antd-vendor': ['antd'],
          'icons-vendor': ['@ant-design/icons'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

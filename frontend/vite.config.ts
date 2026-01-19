import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    outDir: '../web/static',
    emptyOutDir: false, // Don't delete main.wasm and wasm_exec.js
  },
  server: {
    port: 5173,
  },
});

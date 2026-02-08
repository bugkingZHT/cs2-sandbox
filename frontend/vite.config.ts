import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    include: ['protobufjs'],
  },
  worker: {
    format: 'iife',
  },
  build: {
    outDir: '../web/static',
    emptyOutDir: false, // Don't delete main.wasm and wasm_exec.js
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        demolib: resolve(__dirname, 'demolib.html'),
        replayer: resolve(__dirname, 'replayer.html'),
        tactics: resolve(__dirname, 'tactics.html'),
      },
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5173,
  },
});

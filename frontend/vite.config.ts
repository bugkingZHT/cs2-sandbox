import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { FRONTEND_VERSION } from './src/config/version';

export default defineConfig({
  plugins: [vue()],
  define: {
    __FRONTEND_VERSION__: JSON.stringify(FRONTEND_VERSION),
  },
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
    chunkSizeWarningLimit: 1000, // element-plus 体积较大，已做 manualChunks 与按路由懒加载
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        demolib: resolve(__dirname, 'demolib.html'),
        replayer: resolve(__dirname, 'replayer.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus')) return 'element-plus';
            if (id.includes('pixi.js')) return 'pixi';
            if (id.includes('protobufjs')) return 'protobuf';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});

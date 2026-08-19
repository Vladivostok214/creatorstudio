import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    watch: {
      // Ignorar de forma estricta carpetas de datos y archivos json para evitar reinicios al guardar
      ignored: [
        '**/public/**',
        '**/assets/**',
        '**/dist/**',
        '**/*.json',
        '**/timeline.json',
        '**/src-tauri/**',
      ],
    },
  },
});

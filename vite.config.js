import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const buildTime = new Date().toISOString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    chunkSizeWarningLimit: 1500, // Increase limit to 1500 KB (1.5 MB) to reduce warnings
  },
});

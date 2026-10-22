import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Physio/',
  plugins: [react()],
  server: {
    headers: {
      // Required for SharedArrayBuffer used by MediaPipe WASM
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Single .env at the repo root (only VITE_* variables reach the browser).
  // In Docker the variable comes from the build environment instead.
  envDir: '..',
  server: { port: 5173 },
});

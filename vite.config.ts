import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on Vercel, GitHub Pages or any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', sourcemap: false },
  server: { port: 5173 },
});

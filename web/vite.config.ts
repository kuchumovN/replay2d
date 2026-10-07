import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: the static build can be hosted under any path (the app uses hash routing).
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
});

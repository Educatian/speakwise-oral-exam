import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: GEMINI_API_KEY is intentionally not exposed to the client. Scoring
// and Gemini Live auth go through Supabase Edge Functions (see supabase/).
export default defineConfig(() => ({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));

import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        // crxjs handles popup/background/content via the manifest.
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});

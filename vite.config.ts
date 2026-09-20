import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // Exclude bot runtime data files from triggering page reloads.
        // The trading engine writes to data/ every few seconds (settings, positions, signals).
        // Without this, Vite detects those writes as code changes and reloads the page,
        // destroying React state (scanned coins) before the scanner can populate.
        ignored: ['**/data/**', '**/server/**', '**/node_modules/**', '**/.git/**'],
      },
    },
  };
});

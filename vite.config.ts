import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Relative asset paths in built `dist/index.html` so the Electron prod
  // build can load them via `file://`. Without this, Vite defaults to
  // `base: '/'` which emits `/assets/index-XXX.js` — under file:// that
  // resolves to the drive root (e.g. file:///C:/assets/...), not the
  // directory containing index.html, and the React app never boots.
  // Capacitor (capacitor://localhost) and dev (http://localhost:5173)
  // both work with relative paths too, so this is universal-safe.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  publicDir: 'public',
  server: {
    fs: {
      allow: ['.'],
    },
  },
})

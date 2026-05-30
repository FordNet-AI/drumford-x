/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),       // shared player core
      '@studio': path.resolve(__dirname, './src'),  // studio-local code
    },
  },
  server: { port: 5273, fs: { allow: ['..'] } },     // allow importing from ../src
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = emri i repo-s në GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/intal-crm/',
})

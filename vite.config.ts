import { persistencePlugin } from './server/api-plugin.ts'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), persistencePlugin()],
  base: './',
  server: {
    host: true,
    port: 3000,
    strictPort: true,
  },
})

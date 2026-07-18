import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The livecode-OPS logger ships from a private registry that needs an auth
// token. When it's installed (production/CI/normal dev) we bundle it as-is;
// when it isn't (e.g. no token), fall back to a console-only shim so the app
// still builds and runs. Telemetry is only degraded where the token is absent.
const loggerInstalled = fs.existsSync(
  path.resolve(__dirname, 'node_modules/@rendani22/logger/package.json'),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(loggerInstalled
        ? {}
        : { '@rendani22/logger': path.resolve(__dirname, './src/lib/ops-logger-fallback.ts') }),
    },
  },
  server: {
    port: 5173,
    host: true,
    // allow Cloudflare quick-tunnel hosts for remote review
    allowedHosts: ['.trycloudflare.com'],
  },
})

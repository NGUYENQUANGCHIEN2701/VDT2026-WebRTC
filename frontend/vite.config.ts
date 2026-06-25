import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// HTTPS bật KHI có cert mkcert (certs/localhost*.pem); thiếu cert → HTTP thường.
// Tạo cert: mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 <LAN_IP>
const keyPath = 'certs/localhost-key.pem'
const certPath = 'certs/localhost.pem'
const https =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // cho thiết bị khác trong LAN truy cập qua IP
    port: 5173,
    https,
  },
})

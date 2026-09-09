import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* ประทับเวลา build ไว้ให้เห็นบนหน้าจอ เวลามีคนบอกว่าหน้าไม่ขึ้น
   จะได้รู้ทันทีว่าเขากำลังเปิดโค้ดชุดไหน แทนที่จะเดากันไปมา */
export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
})

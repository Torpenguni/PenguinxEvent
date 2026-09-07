import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachUser } from './auth.js'
import authRoutes from './routes/auth.js'
import eventRoutes from './routes/events.js'
import boothRoutes from './routes/booths.js'
import dealRoutes from './routes/deals.js'

const app = express()
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(attachUser)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/booths', boothRoutes)
app.use('/api/deals', dealRoutes)

// ต่อฐานข้อมูลไม่ได้เป็นคนละเรื่องกับบั๊ก ตอบ 503 พร้อมบอกว่าเกิดอะไร
const DB_DOWN = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03', '3D000'])

// ตอนขึ้นจริงเสิร์ฟหน้าเว็บจากโดเมนเดียวกับ API
if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dist = path.resolve(here, '../../web/dist')
  app.use(express.static(dist))
  // ทุกเส้นทางที่ไม่ใช่ /api ส่ง index.html ให้ React จัดการเอง
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, _req, res, _next) => {
  if (DB_DOWN.has(err.code)) {
    console.error('ต่อฐานข้อมูลไม่ได้:', err.code, err.message)
    return res.status(503).json({ error: 'ต่อฐานข้อมูลไม่ได้ ตรวจ DATABASE_URL' })
  }
  if (!err.status) console.error(err)
  res.status(err.status || 500).json({ error: err.status ? err.message : 'เกิดข้อผิดพลาดในระบบ' })
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`api ฟังอยู่ที่ :${port}`))

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachUser } from './auth.js'
import { attachPortal } from './portalAuth.js'
import authRoutes from './routes/auth.js'
import eventRoutes from './routes/events.js'
import boothRoutes from './routes/booths.js'
import dealRoutes from './routes/deals.js'
import fullRoutes from './routes/full.js'
import portalRoutes from './routes/portal.js'
import accessRoutes from './routes/access.js'

/* โฮสต์เดียวกันสองหน้าตา เลือกด้วย PXE_APP
   portal = โดเมนผู้ออกบูธ mount เฉพาะ /api/portal เส้นทางที่มีราคาและงบไม่ได้ถูก mount เลย
   ไม่ตั้ง = โดเมนทีมเรา หรือรันบนเครื่อง
   แยกที่ชั้น mount ไม่ใช่เช็กในแต่ละเส้น เพราะพลาดจุดเดียวข้อมูลเงินหลุดถึงคนนอก */
const isPortal = process.env.PXE_APP === 'portal'

const app = express()
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, app: isPortal ? 'portal' : 'internal' }))

if (isPortal) {
  app.use(attachPortal)
  app.use('/api/portal', portalRoutes)
} else {
  app.use(attachUser)
  app.use('/api/auth', authRoutes)
  app.use('/api/events', eventRoutes)
  app.use('/api/booths', boothRoutes)
  app.use('/api/deals', dealRoutes)
  app.use('/api/events', fullRoutes)
  app.use('/api/exhibitor-access', accessRoutes)
}

// ต่อฐานข้อมูลไม่ได้เป็นคนละเรื่องกับบั๊ก ตอบ 503 พร้อมบอกว่าเกิดอะไร
const DB_DOWN = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03', '3D000'])

// ตอนขึ้นจริงเสิร์ฟหน้าเว็บจากโดเมนเดียวกับ API
if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url))
  /* โดเมนผู้ออกบูธเสิร์ฟหน้าเดียวจบ ไม่ใช่แอปของทีมเรา
     ไฟล์อยู่ใน apps/api/portal เพราะ Vercel แพ็กเฉพาะของที่อยู่ใต้ root ของฟังก์ชัน */
  const dist = isPortal ? path.resolve(here, '../portal')
                        : path.resolve(here, '../../web/dist')
  app.use(express.static(dist))
  // ทุกเส้นทางที่ไม่ใช่ /api ส่ง index.html ให้หน้าเว็บจัดการเอง
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

/* บน Vercel ไม่ต้อง listen เอง เขาเรียก handler ให้เป็นครั้งๆ
   รันเองบนเครื่องถึงจะเปิดพอร์ต แยกสองทางด้วยตัวแปรที่ Vercel ตั้งให้ */
if (!process.env.VERCEL) {
  const port = process.env.PORT || 4000
  app.listen(port, () => console.log(`api ฟังอยู่ที่ :${port}`))
}

export default app

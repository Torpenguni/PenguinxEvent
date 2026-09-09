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
import shareRoutes from './routes/shares.js'
import userRoutes, { setPassword } from './routes/users.js'
import dealMailRoutes from './routes/dealMail.js'
import mailRoutes, { cronReminders } from './routes/mail.js'
import timelineRoutes from './routes/timeline.js'
import exhibitorRoutes from './routes/exhibitors.js'
import { mailBootReport } from './lib/mail.js'

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
  app.use('/api/events', timelineRoutes)
  app.use('/api/events', exhibitorRoutes)
  app.use('/api/exhibitor-access', accessRoutes)
  app.use('/api/shares', shareRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/deals', dealMailRoutes)
  app.use('/api/mail', mailRoutes)
  // ตั้งรหัสผ่านจากลิงก์ในเมล เปิดได้โดยไม่ต้องล็อกอิน จึงอยู่ใต้ /api/auth
  app.post('/api/auth/set-password', setPassword)
  // cron เรียกเข้ามาวันละครั้ง ยืนยันตัวด้วย CRON_SECRET ไม่ใช่ session
  app.get('/api/cron/reminders', cronReminders)
}

/* บอกตั้งแต่ตอนบูตว่าส่งเมลได้หรือไม่ได้ และขาด env ตัวไหน
   "ไม่ได้ตั้งค่า" กับ "พิมพ์ชื่อ env ผิด" หน้าตาเหมือนกันเป๊ะถ้าไม่มีบรรทัดนี้ */
mailBootReport()

// ต่อฐานข้อมูลไม่ได้เป็นคนละเรื่องกับบั๊ก ตอบ 503 พร้อมบอกว่าเกิดอะไร
const DB_DOWN = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03', '3D000'])

// ตอนขึ้นจริงเสิร์ฟหน้าเว็บจากโดเมนเดียวกับ API
if (process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url))
  /* หน้าเว็บทั้งสองชุดอยู่ใต้ apps/api เพราะ Vercel แพ็กเฉพาะของที่อยู่ใต้ root ของฟังก์ชัน
     ของทีมชี้ไป ../../web/dist ไม่ได้ ตอนขึ้นจริงมันอยู่นอกขอบเขตที่ถูกอัปโหลด
     หน้าแรกเลยตอบ 404 ว่าหา index.html ไม่เจอ ทั้งที่ API ทำงานปกติ
     apps/api/web สร้างจาก npm -w apps/web run build แล้วคัดลอกเข้ามา */
  const dist = isPortal ? path.resolve(here, '../portal')
                        : path.resolve(here, '../web')
  /* index.html ห้ามแคช ไม่งั้นคนที่เคยเปิดจะถือหน้าเก่าที่อ้างไฟล์ JS ชื่อเดิม
     ซึ่งหายไปแล้วหลัง build ใหม่ ส่วนไฟล์ใน assets ชื่อมีแฮชอยู่แล้ว แคชยาวได้เลย */
  app.use(express.static(dist, {
    /* ปิดการเสิร์ฟ index.html อัตโนมัติที่ราก ไม่งั้นมันชนะเส้นทางที่ตั้งไว้ข้างล่าง
       แล้วเปิดโดเมนจะได้แอปรุ่นถัดไปแทนตัวหลัก */
    index: false,
    setHeaders: (res, file) => {
      if (file.endsWith('.html')) res.setHeader('cache-control', 'no-store')
      else if (file.includes('/assets/')) {
        res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      }
    },
  }))
  /* หน้าตาชุดเต็มต่อฐานข้อมูลจริง คือตัวหลักที่ใช้พัฒนากันอยู่ตอนนี้
     เปิดโดเมนแล้วเจอตัวนี้เลย ไม่ต้องจำว่าต้องต่อ /app
     แอปรุ่นถัดไปที่ยังทำไม่เสร็จ ย้ายไปอยู่ที่ /next เข้าดูได้แต่ยังไม่ใช่ตัวหลัก */
  app.get(['/', '/app'], (_req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.sendFile(path.join(dist, 'app.html'))
  })
  /* หน้าที่มาจากลิงก์ในอีเมล ต้องอยู่กับแอปรุ่นถัดไปเพราะมันเป็นคนทำหน้าพวกนี้ */
  app.get(['/next', '/set-password', '/invite'], (_req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.sendFile(path.join(dist, 'index.html'))
  })
  /* ทุกเส้นทางที่ไม่ใช่ /api ส่ง index.html ให้หน้าเว็บจัดการเอง
     ยกเว้นสิ่งที่ขอมาเป็นชื่อไฟล์ ต้องตอบ 404 ให้ชัด ของเดิมส่ง index.html กลับไป
     เบราว์เซอร์เลยได้ HTML มาแทนไฟล์ JS แล้วหน้าขาวโดยไม่มีอะไรบอกสาเหตุ */
  app.get(/^\/(?!api\/).*/, (req, res) => {
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).json({ error: 'ไม่พบไฟล์นี้' })
    res.setHeader('cache-control', 'no-store')
    res.sendFile(path.join(dist, 'index.html'))
  })
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

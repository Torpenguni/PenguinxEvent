/* เส้นทางเกี่ยวกับเมล สามกลุ่ม
   - สถานะ กับ ประวัติ ให้ทีมตรวจได้ว่าเมลฉบับไหนออกไปแล้วบ้าง
   - พรีวิวและสั่งส่งเมลเตือนผู้ออกบูธ
   - ปลายทางของ cron ที่เรียกเข้ามาวันละครั้ง */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need } from '../auth.js'
import { mailStatus } from '../lib/mail.js'
import { runReminders } from '../lib/reminders.js'
import { runDigest } from '../lib/digest.js'

const r = Router()

// เปิดดูได้ทุกคนที่ล็อกอิน เพราะคำถาม "ระบบส่งเมลได้ไหม" ต้องตอบได้ทันที
r.get('/status', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' })
  res.json(mailStatus())
})

// ประวัติเมลทั้งหมด หรือเฉพาะของสิ่งใดสิ่งหนึ่ง
r.get('/log', need('exhibitor'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select id, "to", cc, redirected_to, subject, template, entity, entity_id,
              status, error, at
         from mail_log
        where ($1::text is null or entity = $1)
          and ($2::bigint is null or entity_id = $2)
          and ($3::text is null or template = $3)
        order by at desc limit 200`,
      [req.query.entity ?? null, req.query.entity_id ?? null, req.query.template ?? null],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

/* พรีวิวเมลเตือน ไม่ส่งอะไรทั้งสิ้น
   ต้องมีคนอ่านฉบับตัวอย่างก่อนเปิดใช้จริง นี่คือที่ที่ใช้อ่าน */
r.get('/reminders/preview', need('exhibitor'), async (req, res, next) => {
  try {
    // days ให้ลองมองไกลกว่าปกติได้ เช่นอยากรู้ว่าอีก 60 วันข้างหน้าจะเตือนใครบ้าง
    const rows = await runReminders({
      eventId: req.query.event ?? null,
      dryRun: true,
      ...(req.query.days ? { windowDays: Number(req.query.days) } : {}),
    })
    res.json({
      mail: mailStatus(),
      window_days: Number(req.query.days || process.env.REMINDER_WINDOW_DAYS || 14),
      total: rows.length,
      unreachable: rows.filter((x) => !x.to).length,
      rows: req.query.full === '1' ? rows : rows.map(({ html, ...x }) => x),
    })
  } catch (e) { next(e) }
})

// ดูเนื้อเมลจริงของดีลหนึ่งใบเป็น HTML เปิดในเบราว์เซอร์ได้เลย
r.get('/reminders/preview/:dealId', need('exhibitor'), async (req, res, next) => {
  try {
    const rows = await runReminders({ dryRun: true, windowDays: 3650 })
    const one = rows.find((x) => String(x.deal_id) === String(req.params.dealId))
    if (!one) return res.status(404).json({ error: 'ดีลนี้ไม่มีรายการค้างที่จะเตือน' })
    res.type('html').send(one.html)
  } catch (e) { next(e) }
})

/* สั่งส่งจริงด้วยมือ ต้องมีสิทธิ์เขียนโมดูล exhibitor
   และต้องพิมพ์ confirm มาด้วย กันนิ้วลั่นบนหน้าจอ */
r.post('/reminders/send', need('exhibitor', 'write'), async (req, res, next) => {
  try {
    if (req.body?.confirm !== 'send') {
      return res.status(400).json({ error: 'ต้องส่ง confirm = "send" มาด้วย' })
    }
    const rows = await runReminders({
      eventId: req.body?.event_id ?? null,
      dryRun: false,
    })
    res.json({ sent: rows.filter((x) => x.status === 'sent').length, rows })
  } catch (e) { next(e) }
})

/* ปลายทางของ cron
   Vercel ส่ง Authorization: Bearer <CRON_SECRET> มาให้เองถ้าตั้ง env ไว้
   ถ้าไม่ได้ตั้ง CRON_SECRET ปฏิเสธทุกคำขอ ดีกว่าเปิดให้ใครก็ได้สั่งยิงเมล */
export const cronReminders = async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return res.status(503).json({ error: 'ยังไม่ได้ตั้ง CRON_SECRET' })
    const given = (req.headers.authorization || '').replace(/^Bearer /, '')
    if (given !== secret) return res.status(401).json({ error: 'ไม่มีสิทธิ์' })

    const rows = await runReminders({ dryRun: false })
    console.log(`cron เมลเตือน: ${rows.filter((x) => x.status === 'sent').length} ส่ง, `
      + `${rows.filter((x) => x.status === 'skipped').length} ข้าม, `
      + `${rows.filter((x) => x.status === 'failed').length} ไม่สำเร็จ`)
    res.json({ ran: rows.length, rows: rows.map(({ html, ...x }) => x) })
  } catch (e) { next(e) }
}

export default r

/* สรุปงานค้างรายสัปดาห์ของเซลล์ ยิงเช้าวันจันทร์
   ยืนยันตัวด้วย CRON_SECRET เหมือนงานอื่น ไม่ได้ตั้งก็ปฏิเสธทุกคำขอ */
export const cronDigest = async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return res.status(503).json({ error: 'ยังไม่ได้ตั้ง CRON_SECRET' })
    if ((req.headers.authorization || '').replace(/^Bearer /, '') !== secret) {
      return res.status(401).json({ error: 'ไม่มีสิทธิ์' })
    }
    const rows = await runDigest({ dryRun: false })
    console.log(`cron สรุปงานค้าง: ${rows.filter((x) => x.status === 'sent').length} ส่ง, `
      + `${rows.filter((x) => x.status === 'skipped').length} ข้าม, `
      + `${rows.filter((x) => x.status === 'failed').length} ไม่สำเร็จ`)
    res.json({ ran: rows.length, rows: rows.map(({ html, ...x }) => x) })
  } catch (e) { next(e) }
}

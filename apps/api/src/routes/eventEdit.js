/* แก้ข้อมูลระดับงานทีละช่อง และเก็บไฟล์ของงาน
   ของเดิมกรอกได้ครั้งเดียวตอนสร้าง หลังจากนั้นชื่อ วันที่ สถานที่ ที่นั่ง แก้เองไม่ได้เลย
   ต้องให้คนเข้าฐานข้อมูลไปแก้ให้ ทั้งที่งานจริงเลื่อนวันและย้ายห้องกันบ่อยมาก

   แยกจาก PUT ทั้งงาน เพราะการเปลี่ยนชื่องานไม่ควรต้องเขียนบูธ 181 ช่องใหม่ทั้งชุด */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

const num = (v) => (v === '' || v == null ? null : Number(v))
const day = (v) => {
  if (!v) return null
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}
// ช่องที่ยอมให้แก้ กับวิธีแปลงค่า รับเฉพาะที่อยู่ในนี้เท่านั้น
const FIELDS = {
  name: ['name', (v) => String(v ?? '').trim()],
  venue: ['venue', (v) => (v == null ? null : String(v).trim() || null)],
  hall: ['hall', (v) => (v == null ? null : String(v).trim() || null)],
  eventDate: ['start_date', day],
  endDate: ['end_date', day],
  status: ['status', (v) => (['planning', 'selling', 'onsite', 'closed'].includes(v) ? v : 'planning')],
  target: ['revenue_goal', num],
  seats: ['seats', (v) => (num(v) == null ? null : Math.round(num(v)))],
  ticketPrice: ['ticket_price', num],
  ticketsSold: ['tickets_sold', (v) => (num(v) == null ? null : Math.round(num(v)))],
}
// ช่องที่เก็บใน settings ไม่ได้อยู่ในคอลัมน์ของตาราง event
const SETTINGS = ['short', 'dates', 'targetNote']

r.patch('/:code', need('user', 'write'), async (req, res, next) => {
  try {
    const ev = (await q(`select id from event where code = $1`, [req.params.code])).rows[0]
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })

    const sets = [], vals = [], touched = []
    for (const [k, v] of Object.entries(req.body ?? {})) {
      const f = FIELDS[k]
      if (!f) continue
      if (k === 'name' && !String(v ?? '').trim()) {
        return res.status(400).json({ error: 'ชื่องานว่างไม่ได้' })
      }
      vals.push(f[1](v)); sets.push(`${f[0]} = $${vals.length}`); touched.push(k)
    }
    if (sets.length) {
      vals.push(ev.id)
      await q(`update event set ${sets.join(', ')} where id = $${vals.length}`, vals)
    }

    // แบรนด์เก็บคนละตาราง ส่งมาเป็นรายการก็เขียนทับทั้งชุด
    if (Array.isArray(req.body?.brands)) {
      const list = req.body.brands.map((b) => String(b).trim()).filter(Boolean)
      await q(`delete from event_brand where event_id = $1`, [ev.id])
      for (const b of list) {
        await q(`insert into event_brand (event_id, code, name) values ($1,$2,$3)`, [ev.id, b, b])
      }
      touched.push('brands')
    }

    const patch = {}
    for (const k of SETTINGS) if (k in (req.body ?? {})) { patch[k] = req.body[k]; touched.push(k) }
    if (Object.keys(patch).length) {
      await q(
        `insert into event_setting (event_id, settings) values ($1, $2::jsonb)
         on conflict (event_id) do update set settings = event_setting.settings || excluded.settings`,
        [ev.id, JSON.stringify(patch)])
    }

    if (!touched.length) return res.status(400).json({ error: 'ไม่มีอะไรให้แก้' })
    await audit(req, 'event', ev.id, 'update', touched.join(','), null,
      JSON.stringify(req.body).slice(0, 300))
    const out = (await q(
      `select code, name, venue, hall, start_date::text, end_date::text, status,
              revenue_goal, seats, ticket_price, tickets_sold from event where id = $1`, [ev.id])).rows[0]
    res.json(out)
  } catch (e) { next(e) }
})

/* ไฟล์ของงาน โลโก้กับไฟล์ผังพื้นที่
   สองอย่างนี้ถูกกันไม่ให้ติดไปกับการบันทึกทั้งงานตั้งแต่ต้น เพราะเป็นก้อนใหญ่
   ผลคือกดอัปโหลดแล้วเห็นทันทีแต่รีเฟรชหาย ให้ส่งแยกทางนี้ทีเดียวจบ */
const MAX = { logo: 600 * 1024, plan: 4 * 1024 * 1024 }
r.put('/:code/file/:kind', need('user', 'write'), async (req, res, next) => {
  try {
    const kind = req.params.kind
    if (!['logo', 'plan'].includes(kind)) return res.status(400).json({ error: 'ชนิดไฟล์ไม่ถูกต้อง' })
    const ev = (await q(`select id from event where code = $1`, [req.params.code])).rows[0]
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })

    const data = req.body?.data ?? null           // data URI หรือ null เพื่อลบทิ้ง
    if (data != null) {
      if (typeof data !== 'string' || !data.startsWith('data:')) {
        return res.status(400).json({ error: 'ต้องเป็นไฟล์ที่แปลงเป็น data URI แล้ว' })
      }
      if (data.length > MAX[kind]) {
        return res.status(413).json({
          error: `ไฟล์ใหญ่เกินไป จำกัดที่ ${Math.round(MAX[kind] / 1024)} KB`,
        })
      }
    }
    const key = kind === 'logo' ? 'logo' : 'planFile'
    const name = req.body?.name ?? null
    await q(
      `insert into event_setting (event_id, settings) values ($1, $2::jsonb)
       on conflict (event_id) do update set settings = event_setting.settings || excluded.settings`,
      [ev.id, JSON.stringify({ [key]: data, [key + 'Name']: name })])
    /* โลโก้ที่อัปโหลดเองทับ path ของไฟล์ที่ตั้งไว้ ไม่งั้นจะเห็นของเก่าค้าง */
    if (kind === 'logo') await q(`update event set logo_url = null where id = $1`, [ev.id])
    await audit(req, 'event', ev.id, 'upload', kind, null, name ?? (data ? 'uploaded' : 'removed'))
    res.json({ ok: true, kind, size: data ? data.length : 0, name })
  } catch (e) { next(e) }
})

export default r

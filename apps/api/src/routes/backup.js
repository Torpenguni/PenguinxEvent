/* สำรองข้อมูลรายวันและกู้คืน
   วันนี้ข้อมูลหายไปสองรอบเพราะโค้ดเขียนทับด้วยของว่าง กู้ได้เพราะบังเอิญยังมีไฟล์ต้นฉบับ
   ถ้าเป็นของที่ทีมกรอกเองจะไม่มีอะไรให้กู้เลย และ Neon แผนฟรีย้อนเวลาไม่ได้ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need } from '../auth.js'

const r = Router()

export async function takeBackup (fetchFull) {
  const codes = (await q(`select code from event where status <> 'archived' order by id`)).rows
  const done = []
  for (const { code } of codes) {
    const full = await fetchFull(code, {
      budget: { level: 'write' }, target: { level: 'write' }, price: { level: 'write' },
      deal: { level: 'write', scope: 'all' }, stage: { level: 'write' },
      exhibitor: { level: 'write' }, timeline: { level: 'write' },
    }, { agent_id: null })
    if (!full) continue
    const json = JSON.stringify(full)
    await q(
      `insert into event_backup (event_id, code, size_bytes, data)
       values ((select id from event where code=$1), $1, $2, $3::jsonb)
       on conflict (code, taken_on) do update
         set data = excluded.data, size_bytes = excluded.size_bytes, at = now()`,
      [code, json.length, json])
    done.push({ code, size: json.length })
  }
  /* เก็บ 30 วันล่าสุดพอ ฐานข้อมูลไม่ใหญ่แต่ก็ไม่ควรโตไปเรื่อย ๆ */
  await q(`delete from event_backup where taken_on < current_date - 30`)
  return done
}

// รายการสำรองที่มี ดูได้ว่าย้อนกลับไปได้ถึงวันไหน
r.get('/', need('user'), async (_req, res, next) => {
  try {
    const { rows } = await q(
      `select code, taken_on::text as วันที่, size_bytes, at from event_backup
        order by taken_on desc, code limit 100`)
    res.json(rows)
  } catch (e) { next(e) }
})

// ดาวน์โหลดก้อนของวันนั้นไปเก็บไว้เอง
r.get('/:code/:date', need('user'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select data from event_backup where code=$1 and taken_on=$2`,
      [req.params.code, req.params.date])
    if (!rows[0]) return res.status(404).json({ error: 'ไม่มีข้อมูลสำรองของวันนั้น' })
    res.setHeader('content-disposition',
      `attachment; filename="${req.params.code}-${req.params.date}.json"`)
    res.json(rows[0].data)
  } catch (e) { next(e) }
})

export default r

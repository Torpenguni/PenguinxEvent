/* แก้งานไทม์ไลน์ทีละแถว
   ของเดิมมีแต่ PUT ที่เขียนทั้งงานใหม่หมด วัดจริงแล้วใช้เวลา 59 วินาที
   เพราะต้องเขียน 181 บูธ 94 ดีล 137 ช่วงเวที ใหม่ทั้งชุด เพียงเพื่อเปลี่ยนสถานะช่องเดียว
   บน Vercel จะไม่ทันหมดเวลาก่อน คนใช้เห็นแค่คำว่ากำลังบันทึกค้างอยู่ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

const ST_IN = { '': 'plan', plan: 'plan', doing: 'doing', done: 'done', risk: 'risk' }

// แผนที่จากชื่อที่หน้าเว็บใช้ ไปเป็นชื่อคอลัมน์ รับเฉพาะที่อยู่ในนี้เท่านั้น
const FIELDS = {
  st: ['status', (v) => ST_IN[v ?? ''] ?? 'plan'],
  a: ['plan_a', (v) => (v == null ? null : Math.round(v))],
  b: ['plan_b', (v) => (v == null ? null : Math.round(v))],
  aa: ['act_a', (v) => (v == null ? null : Math.round(v))],
  ab: ['act_b', (v) => (v == null ? null : Math.round(v))],
  note: ['note', (v) => (v == null ? null : String(v))],
  name: ['name', (v) => String(v ?? '').trim()],
  by: ['work_by', (v) => (v == null ? null : String(v))],
}

r.patch('/:code/timeline/:id', need('timeline', 'write'), async (req, res, next) => {
  try {
    const own = await q(
      `select t.id from timeline_task t join event e on e.id = t.event_id
        where t.id = $1 and e.code = $2`,
      [req.params.id, req.params.code],
    )
    if (!own.rowCount) return res.status(404).json({ error: 'ไม่พบงานนี้ในงานที่ระบุ' })

    const sets = [], vals = []
    for (const [k, v] of Object.entries(req.body ?? {})) {
      const f = FIELDS[k]
      if (!f) continue
      vals.push(f[1](v))
      sets.push(`${f[0]} = $${vals.length}`)
    }
    if (!sets.length) return res.status(400).json({ error: 'ไม่มีอะไรให้แก้' })
    if (req.body.name != null && !String(req.body.name).trim()) {
      return res.status(400).json({ error: 'ชื่องานว่างไม่ได้' })
    }

    vals.push(req.params.id)
    const { rows } = await q(
      `update timeline_task set ${sets.join(', ')}, updated_at = now()
        where id = $${vals.length}
        returning id, status, plan_a, plan_b, act_a, act_b, note, name, work_by`,
      vals,
    )
    await audit(req, 'timeline_task', req.params.id, 'update',
      Object.keys(req.body).join(','), null, JSON.stringify(req.body).slice(0, 200))
    res.json(rows[0])
  } catch (e) { next(e) }
})

export default r

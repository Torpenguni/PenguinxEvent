/* ทะเบียนผู้ซื้อของ hosted buyer program
   แยกเป็น endpoint ของตัวเอง ไม่ไปรวมกับการบันทึกทั้งงาน
   เพราะการบันทึกทั้งงานลบทุกอย่างแล้วเขียนใหม่ ซึ่งไม่เหมาะกับข้อมูลที่คนละคนแก้กันคนละเวลา
   และรายชื่อผู้ซื้อหลักร้อยไม่ควรถูกส่งไปกลับทุกครั้งที่มีคนขยับบูธ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

const STATUS = ['applied', 'qualified', 'invited', 'confirmed', 'attended', 'declined']
const txt = (v) => { const t = String(v ?? '').trim(); return t || null }
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null }
const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])

/* has_shop ถูกตัดออกจากฟอร์ม จำนวนสาขาบอกเรื่องเดียวกันได้ละเอียดกว่า
   สาขาตั้งแต่หนึ่งแห่งก็คือเปิดแล้ว ศูนย์คือยังไม่เปิด ไม่ต้องถามสองคำถาม
   คอลัมน์ยังอยู่ในฐานข้อมูลเผื่อข้อมูลเก่า แต่ไม่มีใครเขียนเข้าไปอีก */
const FIELDS = ['name', 'company', 'position', 'province', 'purpose', 'branches',
  'budget_band', 'interests', 'email', 'phone', 'status', 'note', 'source']

function clean (b) {
  return {
    name: txt(b.name), company: txt(b.company), position: txt(b.position),
    province: txt(b.province), purpose: txt(b.purpose),
    branches: num(b.branches),
    budget_band: txt(b.budgetBand ?? b.budget_band), interests: list(b.interests),
    email: txt(b.email), phone: txt(b.phone),
    status: STATUS.includes(b.status) ? b.status : 'applied',
    note: txt(b.note), source: txt(b.source) ?? 'manual',
  }
}
const out = (x) => ({
  id: String(x.id), name: x.name, company: x.company, position: x.position,
  province: x.province, purpose: x.purpose, branches: x.branches,
  budgetBand: x.budget_band, interests: x.interests ?? [], email: x.email, phone: x.phone,
  status: x.status, note: x.note, source: x.source, createdAt: x.created_at,
})

async function eventOf (code) {
  return (await q(`select id, code from event where code = $1`, [code])).rows[0]
}

r.get('/:code/buyers', need('deal'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    /* ต่อสายกลับก่อนอ่าน แถว event ถูกสร้างใหม่ทุกครั้งที่บันทึกทั้งงาน
       ทำให้ event_id ของผู้ซื้อกลายเป็นค่าว่าง ทั้งที่ข้อมูลยังอยู่ครบ */
    await q(`update buyer set event_id = $2 where code = $1 and event_id is distinct from $2`,
      [ev.code, ev.id])
    const rows = (await q(
      `select * from buyer where code = $1 order by created_at desc, id desc`, [ev.code])).rows
    res.json(rows.map(out))
  } catch (e) { next(e) }
})

r.post('/:code/buyers', need('deal', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const b = clean(req.body ?? {})
    if (!b.name) return res.status(400).json({ error: 'ต้องมีชื่อผู้ซื้อ' })
    const row = (await q(
      `insert into buyer (event_id, code, ${FIELDS.join(', ')})
       values ($1,$2,${FIELDS.map((_, i) => '$' + (i + 3)).join(',')}) returning *`,
      [ev.id, ev.code, ...FIELDS.map((f) => b[f])])).rows[0]
    await audit(req, 'buyer', row.id, 'create', null, null, b.name)
    res.status(201).json(out(row))
  } catch (e) { next(e) }
})

r.patch('/buyers/:id', need('deal', 'write'), async (req, res, next) => {
  try {
    const cur = (await q(`select * from buyer where id = $1`, [req.params.id])).rows[0]
    if (!cur) return res.status(404).json({ error: 'ไม่พบผู้ซื้อรายนี้' })
    const b = clean({ ...out(cur), ...req.body })
    if (!b.name) return res.status(400).json({ error: 'ชื่อว่างไม่ได้' })
    const row = (await q(
      `update buyer set ${FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now()
        where id = $1 returning *`,
      [req.params.id, ...FIELDS.map((f) => b[f])])).rows[0]
    await audit(req, 'buyer', row.id, 'update',
      Object.keys(req.body ?? {}).join(','), cur.status, b.status)
    res.json(out(row))
  } catch (e) { next(e) }
})

r.delete('/buyers/:id', need('deal', 'write'), async (req, res, next) => {
  try {
    const row = (await q(`delete from buyer where id = $1 returning name`, [req.params.id])).rows[0]
    if (!row) return res.status(404).json({ error: 'ไม่พบผู้ซื้อรายนี้' })
    await audit(req, 'buyer', req.params.id, 'delete', null, row.name, 'ลบแล้ว')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* นำเข้าทีละหลายราย ใช้ตอนยกรายชื่อจาก Odoo หรือไฟล์ที่ทีมทำไว้
   ซ้ำถือว่าเป็นคนเดิมถ้าอีเมลตรงกัน อัปเดตทับแทนที่จะเพิ่มแถวใหม่
   ไม่งั้นนำเข้าสองรอบจะได้รายชื่อซ้ำสองเท่า ซึ่งเคยเกิดกับตารางบริษัทมาแล้ว */
r.post('/:code/buyers/import', need('deal', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    if (!rows.length) return res.status(400).json({ error: 'ไม่มีข้อมูลให้นำเข้า' })
    if (rows.length > 2000) return res.status(413).json({ error: 'นำเข้าได้ครั้งละไม่เกิน 2000 แถว' })

    let added = 0, updated = 0, skipped = 0
    for (const raw of rows) {
      const b = clean({ source: 'import', ...raw })
      if (!b.name) { skipped++; continue }
      const dup = b.email
        ? (await q(`select id from buyer where code = $1 and lower(email) = lower($2)`,
            [ev.code, b.email])).rows[0]
        : null
      if (dup) {
        await q(`update buyer set ${FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')},
                 updated_at = now() where id = $1`, [dup.id, ...FIELDS.map((f) => b[f])])
        updated++
      } else {
        await q(`insert into buyer (event_id, code, ${FIELDS.join(', ')})
                 values ($1,$2,${FIELDS.map((_, i) => '$' + (i + 3)).join(',')})`,
          [ev.id, ev.code, ...FIELDS.map((f) => b[f])])
        added++
      }
    }
    /* audit_log.entity_id ห้ามว่าง การนำเข้าเป็นการกระทำระดับงาน ไม่ใช่ระดับผู้ซื้อรายใดราย
       จึงอ้างที่งานแทน ของเดิมส่ง null แล้วทั้งคำขอพังหลังจากที่ข้อมูลเข้าไปแล้ว
       ผู้ใช้เห็นว่าล้มเหลวทั้งที่นำเข้าสำเร็จ */
    await audit(req, 'buyer', ev.id, 'import', null, null, `เพิ่ม ${added} แก้ ${updated}`)
    res.json({ added, updated, skipped })
  } catch (e) { next(e) }
})

export default r

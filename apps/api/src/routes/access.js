/* ฝั่งทีมเรา สร้างและถอนลิงก์เข้าพอร์ทัลของผู้ออกบูธ
   อยู่ในโมดูล exhibitor ตามตารางสิทธิ์ที่มีอยู่แล้ว ไม่ได้เพิ่มโมดูลใหม่ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'
import { createLink } from '../portalAuth.js'

const r = Router()

r.get('/:dealId', need('exhibitor'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select id, email, created_at, expires_at, accepted_at, last_seen_at, revoked_at
         from portal_access where deal_id = $1 order by created_at desc`,
      [req.params.dealId],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

/* สร้างลิงก์แล้วคืนค่าเต็มครั้งเดียว ทีมงานคัดลอกส่งให้ผู้ออกบูธเอง
   ยังไม่มีระบบส่งอีเมลอัตโนมัติ อันนั้นค่อยต่อทีหลัง */
r.post('/:dealId', need('exhibitor', 'write'), async (req, res, next) => {
  try {
    const { email, days = 120 } = req.body ?? {}
    if (!email) return res.status(400).json({ error: 'ต้องมีอีเมลผู้ออกบูธ' })

    const deal = await q(`select id from deal where id = $1 and status not in ('lost','cancelled')`,
                         [req.params.dealId])
    if (!deal.rowCount) return res.status(404).json({ error: 'ไม่พบดีลนี้' })

    const link = await createLink(req.params.dealId, email, days, req.user.id)
    await audit(req, 'portal_access', link.id, 'create', 'email', null, email)

    const base = (process.env.PORTAL_URL || '').replace(/\/$/, '')
    res.status(201).json({ ...link, url: base ? `${base}/#${link.key}` : null })
  } catch (e) { next(e) }
})

// ถอนสิทธิ์ ไม่ลบแถวทิ้ง จะได้ตอบได้ว่าเคยให้ใครเข้าดูไว้บ้าง
r.post('/:id/revoke', need('exhibitor', 'write'), async (req, res, next) => {
  try {
    const { rowCount } = await q(
      `update portal_access set revoked_at = now() where id = $1 and revoked_at is null`,
      [req.params.id],
    )
    if (!rowCount) return res.status(404).json({ error: 'ไม่พบลิงก์นี้ หรือถอนไปแล้ว' })
    await audit(req, 'portal_access', req.params.id, 'revoke')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default r

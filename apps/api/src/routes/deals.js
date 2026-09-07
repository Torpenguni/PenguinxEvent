import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

r.get('/', need('deal'), async (req, res, next) => {
  try {
    const own = req.scope === 'own'
    const { rows } = await q(
      `select d.*, c.name as company, u.name as sales,
              v.received, v.outstanding, v.discount_pct,
              case when d.hold_expires_at is null then null
                   else (d.hold_expires_at::date - current_date) end as hold_days_left
         from deal d
         join company c on c.id = d.company_id
         left join app_user u on u.id = d.owner_id
         left join v_deal_value v on v.deal_id = d.id
        where d.event_id = $1
          and ($2::bool = false or d.owner_id = $3)
        order by d.deal_total desc`,
      [req.query.event, own, req.user.id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

// ดีลที่ต้องตามก่อน เลยกำหนดมัดจำ ใกล้ครบ 7 วัน หรือไม่มีนัดถัดไป
r.get('/attention', need('deal'), async (req, res, next) => {
  try {
    const own = req.scope === 'own'
    const { rows } = await q(
      `select d.id, c.name as company, d.status, d.hold_expires_at,
              (d.hold_expires_at::date - current_date) as days_left,
              case when d.hold_expires_at::date < current_date then 'overdue'
                   when d.hold_expires_at::date - current_date <= 7 then 'due_soon'
                   else 'ok' end as flag
         from deal d
         join company c on c.id = d.company_id
        where d.event_id = $1
          and d.status = 'booking'
          and d.hold_expires_at is not null
          and ($2::bool = false or d.owner_id = $3)
        order by d.hold_expires_at`,
      [req.query.event, own, req.user.id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

// เซลล์เลือกได้ 30 45 60 วัน นับจากวันนี้
r.patch('/:id/hold', need('deal', 'write'), async (req, res, next) => {
  try {
    const days = Number(req.body?.days)
    if (![30, 45, 60].includes(days)) {
      return res.status(400).json({ error: 'เลือกได้ 30 45 หรือ 60 วันเท่านั้น' })
    }
    const { rows } = await q(
      `update deal
          set hold_days = $2,
              hold_started_at = current_date,
              hold_expires_at = now() + ($2 || ' days')::interval,
              updated_at = now()
        where id = $1 and ($3::bool = false or owner_id = $4)
        returning hold_expires_at`,
      [req.params.id, days, req.scope === 'own', req.user.id],
    )
    if (!rows[0]) return res.status(403).json({ error: 'แก้ดีลของคนอื่นไม่ได้' })
    await audit(req, 'deal', req.params.id, 'update', 'hold_days', null, days)
    res.json(rows[0])
  } catch (e) { next(e) }
})

export default r

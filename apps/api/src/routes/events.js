import { Router } from 'express'
import { q } from '../db.js'
import { require as need } from '../auth.js'

const r = Router()

// หน้าเลือกงานไม่ส่งตัวเลขเงินใด ๆ ทุกบทบาทเห็นหน้านี้เหมือนกัน
r.get('/', need('floorplan'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select e.id, e.code, e.name, e.venue, e.hall, e.start_date, e.end_date, e.status,
              e.logo_url,
              coalesce(json_agg(b.name order by b.id) filter (where b.id is not null), '[]') as brands
         from event e
         left join event_brand b on b.event_id = e.id
         left join user_event ue on ue.event_id = e.id and ue.user_id = $1
        where e.status <> 'archived'
        group by e.id
        order by e.start_date desc nulls last`,
      [req.user.id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

r.get('/:id/summary', need('budget'), async (req, res, next) => {
  try {
    const { rows } = await q(`select * from v_event_pace where event_id = $1`, [req.params.id])
    res.json(rows[0] ?? null)
  } catch (e) { next(e) }
})

export default r

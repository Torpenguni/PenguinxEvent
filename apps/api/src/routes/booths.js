import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

r.get('/', need('floorplan'), async (req, res, next) => {
  try {
    const own = req.scope === 'own'
    const { rows } = await q(
      `select b.id, b.code, b.label, b.grid_x, b.grid_y, b.grid_w, b.grid_h,
              b.is_corner, b.status, b.blocked_as,
              z.code as zone, z.name as zone_name, z.colour,
              bt.code as booth_type, bt.list_price,
              d.id as deal_id, d.status as deal_status,
              d.hold_days, d.hold_expires_at,
              -- เซลล์เห็นชื่อลูกค้าเฉพาะดีลของตัวเอง ตรวจที่นี่ ไม่ใช่ที่หน้าจอ
              case when $2::bool and d.owner_id is distinct from $3 then null
                   else c.name end as company,
              u.name as sales,
              (select count(*)::int from booth_queue bq
                where bq.booth_id = b.id and bq.status = 'waiting') as queue_len
         from booth b
         left join zone z on z.id = b.zone_id
         left join booth_type bt on bt.id = b.booth_type_id
         left join deal_item di on di.booth_id = b.id
         left join deal d on d.id = di.deal_id and d.status not in ('lost','cancelled')
         left join company c on c.id = d.company_id
         left join app_user u on u.id = d.owner_id
        where b.event_id = $1
        order by b.code`,
      [req.params.eventId ?? req.query.event, own, req.user.id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

const STEPS = { available: 'held', held: 'contracted', contracted: 'deposit_paid', deposit_paid: 'paid' }

r.patch('/:id/status', need('floorplan', 'write'), async (req, res, next) => {
  const client = await (await import('../db.js')).pool.connect()
  try {
    await client.query('begin')
    const cur = await client.query(`select status from booth where id = $1 for update`, [req.params.id])
    if (!cur.rowCount) return res.status(404).json({ error: 'ไม่พบบูธนี้' })
    const from = cur.rows[0].status
    const to = req.body?.status ?? STEPS[from]
    if (!to) return res.status(400).json({ error: 'บูธนี้ไปต่อไม่ได้แล้ว' })

    await client.query(`update booth set status = $2 where id = $1`, [req.params.id, to])
    await client.query('commit')
    await audit(req, 'booth', req.params.id, 'status_change', 'status', from, to)
    res.json({ status: to })
  } catch (e) {
    await client.query('rollback').catch(() => {})
    next(e)
  } finally {
    client.release()
  }
})

// คิวถัดไปขึ้นมาแทน ใช้ทั้งตอนยกเลิกเองและตอนเลยกำหนดมัดจำ
r.post('/:id/release', need('floorplan', 'write'), async (req, res, next) => {
  const { pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    await client.query('begin')
    const nxt = await client.query(
      `select id, deal_id from booth_queue
        where booth_id = $1 and status = 'waiting'
        order by position limit 1 for update`,
      [req.params.id],
    )
    if (nxt.rowCount) {
      await client.query(`update booth_queue set status = 'promoted' where id = $1`, [nxt.rows[0].id])
      await client.query(`update booth set status = 'held' where id = $1`, [req.params.id])
    } else {
      await client.query(`update booth set status = 'available' where id = $1`, [req.params.id])
    }
    await client.query('commit')
    await audit(req, 'booth', req.params.id, 'release', null, null,
      nxt.rowCount ? `promoted deal ${nxt.rows[0].deal_id}` : 'available')
    res.json({ promoted: nxt.rows[0]?.deal_id ?? null })
  } catch (e) {
    await client.query('rollback').catch(() => {})
    next(e)
  } finally {
    client.release()
  }
})

export default r

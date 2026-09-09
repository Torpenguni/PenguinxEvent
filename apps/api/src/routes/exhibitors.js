/* มุมมองของทีมเราต่อผู้ออกบูธ คู่กับพอร์ทัลที่ผู้ออกบูธเห็นเอง
   ข้อมูลชุดเดียวกัน คนละมุม ทีมเห็นทุกบูธและรู้ว่าต้องโทรหาใคร
   ผู้ออกบูธเห็นเฉพาะของตัวเอง

   แยกเป็นเส้นทางของตัวเองแทนที่จะใช้ก้อน full เพราะก้อนนั้นหนัก 195 KB
   และการติ๊กงานหนึ่งช่องไม่ควรต้องเขียนทั้งงานใหม่ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

// งานที่ผู้ออกบูธต้องทำเอง พร้อมกำหนดส่งที่นับถอยหลังจากวันเข้าพื้นที่
const TASK_SQL = `
  select tt.id as template_id, tt.code, tt.label, tt.required, tt.phase, tt.sort,
         tt.instructions, tt.applies_to,
         coalesce(et.done, false) as done, et.done_at, et.note,
         coalesce(et.due_date, (coalesce(e.move_in_from, e.start_date) - tt.due_offset_days)) as due_date
    from task_template tt
    join event e on e.id = tt.event_id
    left join exhibitor_task et on et.deal_id = $2 and et.template_id = tt.id
   where tt.event_id = $1 and tt.assigned_to = 'exhibitor'
   order by tt.sort, tt.id`

r.get('/:code/exhibitors', need('exhibitor'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `with ev as (select id, coalesce(move_in_from, start_date) as ref from event where code = $1),
       tpl as (select count(*)::int n from task_template
                where event_id = (select id from ev) and assigned_to = 'exhibitor'),
       booths as (
         select di.deal_id, string_agg(b.code, ', ' order by b.code) as booths
           from deal_item di join booth b on b.id = di.booth_id group by di.deal_id),
       contact as (
         select distinct on (company_id) company_id, name, email, phone
           from contact_person order by company_id, is_primary desc, id)
       select d.id, c.name as company, bo.booths,
              ct.name as contact_name, ct.email as contact_email, ct.phone as contact_phone,
              ow.name as owner,
              (select count(*)::int from exhibitor_task et
                where et.deal_id = d.id and et.done) as done,
              (select n from tpl) as total,
              (select count(*)::int from task_template tt
                left join exhibitor_task et on et.deal_id = d.id and et.template_id = tt.id
               where tt.event_id = d.event_id and tt.assigned_to = 'exhibitor'
                 and coalesce(et.done,false) = false
                 and (coalesce(et.due_date, (select ref from ev) - tt.due_offset_days) < current_date)
              ) as overdue,
              (select status from mail_log m
                where m.entity = 'deal' and m.entity_id = d.id
                  and m.template = 'exhibitor_reminder' order by m.at desc limit 1) as last_reminder,
              exists (select 1 from portal_access pa
                       where pa.deal_id = d.id and pa.revoked_at is null
                         and pa.expires_at > now()) as has_link
         from deal d
         join ev on ev.id = d.event_id
         join company c on c.id = d.company_id
         left join booths bo on bo.deal_id = d.id
         left join contact ct on ct.company_id = d.company_id
         left join app_user ow on ow.id = d.owner_id
        where d.status in ('confirmed','billed','paid')
        order by (select count(*)::int from exhibitor_task et
                   where et.deal_id = d.id and et.done) asc, c.name`,
      [req.params.code],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

r.get('/:code/exhibitors/:dealId', need('exhibitor'), async (req, res, next) => {
  try {
    const ev = await q(`select id from event where code = $1`, [req.params.code])
    if (!ev.rowCount) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const { rows } = await q(TASK_SQL, [ev.rows[0].id, req.params.dealId])
    res.json(rows)
  } catch (e) { next(e) }
})

// ติ๊กแทนผู้ออกบูธได้ เพราะหลายรายส่งของมาทางไลน์หรืออีเมลถึงทีมโดยตรง
r.patch('/:code/exhibitors/:dealId/tasks/:templateId', need('exhibitor', 'write'),
  async (req, res, next) => {
    try {
      const ok = await q(
        `select 1 from task_template tt join event e on e.id = tt.event_id
          where tt.id = $1 and e.code = $2 and tt.assigned_to = 'exhibitor'`,
        [req.params.templateId, req.params.code],
      )
      if (!ok.rowCount) return res.status(404).json({ error: 'ไม่พบงานนี้' })
      const done = !!req.body?.done
      const { rows } = await q(
        `insert into exhibitor_task (deal_id, template_id, done, done_at, done_by)
         values ($1,$2,$3, case when $3 then now() end, $4)
         on conflict (deal_id, template_id) do update
           set done = excluded.done,
               done_at = case when excluded.done then coalesce(exhibitor_task.done_at, now()) end,
               done_by = excluded.done_by
         returning template_id, done, done_at`,
        [req.params.dealId, req.params.templateId, done, req.user.id],
      )
      await audit(req, 'exhibitor_task', req.params.dealId, 'update', 'done', null, String(done))
      res.json(rows[0])
    } catch (e) { next(e) }
  })

export default r

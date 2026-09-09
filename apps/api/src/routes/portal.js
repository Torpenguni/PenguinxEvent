/* พอร์ทัลผู้ออกบูธ — ทุกเส้นทางในไฟล์นี้เห็นได้เฉพาะดีลของตัวเอง
   ไม่มี endpoint ไหนที่คืนราคา งบ ผังคนอื่น หรือดีลใบอื่นเลย
   และเมื่อรันด้วย PXE_APP=portal เส้นทางของทีมข้างในจะไม่ถูก mount ตั้งแต่ต้น */
import { Router } from 'express'
import { q } from '../db.js'
import { exchange, needPortal } from '../portalAuth.js'

const r = Router()

// เปิดลิงก์ที่ทีมงานส่งให้ แลกเป็น token
r.post('/session', async (req, res, next) => {
  try {
    const key = req.body?.key
    if (!key) return res.status(400).json({ error: 'ลิงก์ไม่ครบ' })
    res.json(await exchange(key))
  } catch (e) { next(e) }
})

// ของทั้งหมดที่ผู้ออกบูธต้องเห็น รวบมาให้ในครั้งเดียว
r.get('/me', needPortal, async (req, res, next) => {
  try {
    const { deal_id } = req.portal

    const head = await q(
      `select d.id, c.name as company, c.name_th, c.logo_url,
              e.name as event, e.venue, e.hall, e.start_date, e.end_date,
              e.move_in_from, e.move_out_to,
              coalesce(sum(bt.badge_exhibitor), 0)::int  as quota_exhibitor,
              coalesce(sum(bt.badge_contractor), 0)::int as quota_contractor
         from deal d
         join company c on c.id = d.company_id
         join event e on e.id = d.event_id
         left join deal_item di on di.deal_id = d.id and di.booth_id is not null
         left join booth b on b.id = di.booth_id
         left join booth_type bt on bt.id = b.booth_type_id
        where d.id = $1
        group by d.id, c.name, c.name_th, c.logo_url, e.name, e.venue, e.hall,
                 e.start_date, e.end_date, e.move_in_from, e.move_out_to`,
      [deal_id],
    )

    // บูธของตัวเอง บอกแค่รหัสกับขนาด ไม่บอกราคา
    const booths = await q(
      `select b.code, b.label, bt.name as package, bt.build,
              bt.width_m, bt.depth_m, bt.sqm, z.name as zone
         from deal_item di
         join booth b on b.id = di.booth_id
         left join booth_type bt on bt.id = b.booth_type_id
         left join zone z on z.id = b.zone_id
        where di.deal_id = $1
        order by b.code`,
      [deal_id],
    )

    /* งานที่ต้องส่ง เอาเฉพาะที่ assigned_to = 'exhibitor'
       งานของทีมเราไม่โผล่ในนี้ และกำหนดส่งนับถอยหลังจากวันเข้างาน */
    const tasks = await q(
      `select tt.id as template_id, tt.code, tt.label, tt.phase, tt.required,
              tt.instructions, tt.sort,
              coalesce(et.done, false) as done, et.done_at, et.note, et.file_url,
              coalesce(et.due_date,
                       (coalesce(e.move_in_from, e.start_date) - tt.due_offset_days)) as due_date
         from task_template tt
         join deal d on d.id = $1
         join event e on e.id = d.event_id and e.id = tt.event_id
         left join deal_item di on di.deal_id = d.id and di.booth_id is not null
         left join booth b on b.id = di.booth_id
         left join booth_type bt on bt.id = b.booth_type_id
         left join exhibitor_task et on et.deal_id = d.id and et.template_id = tt.id
        where tt.assigned_to = 'exhibitor'
          and (tt.applies_to is null or tt.applies_to = 'all'
               or tt.applies_to = bt.build)
        group by tt.id, et.done, et.done_at, et.note, et.file_url, et.due_date,
                 e.move_in_from, e.start_date
        order by tt.sort, tt.id`,
      [deal_id],
    )

    const staff = await q(
      `select id, name, role, phone, email, badge_type
         from booth_staff where deal_id = $1 order by badge_type, id`,
      [deal_id],
    )

    if (!head.rows[0]) return res.status(404).json({ error: 'ไม่พบข้อมูลบูธ' })
    res.json({
      ...head.rows[0],
      email: req.portal.email,
      booths: booths.rows,
      tasks: tasks.rows,
      staff: staff.rows,
    })
  } catch (e) { next(e) }
})

// ติ๊กว่าส่งแล้วหรือยัง ทำได้เฉพาะงานที่เป็นของผู้ออกบูธในงานของตัวเอง
r.post('/tasks/:templateId', needPortal, async (req, res, next) => {
  try {
    const { deal_id, event_id } = req.portal
    const { done = true, note = null } = req.body ?? {}

    const ok = await q(
      `select 1 from task_template
        where id = $1 and event_id = $2 and assigned_to = 'exhibitor'`,
      [req.params.templateId, event_id],
    )
    if (!ok.rowCount) return res.status(404).json({ error: 'ไม่พบงานนี้' })

    const { rows } = await q(
      `insert into exhibitor_task (deal_id, template_id, done, done_at, note)
       values ($1, $2, $3, case when $3 then now() end, $4)
       on conflict (deal_id, template_id) do update
         set done = excluded.done,
             done_at = case when excluded.done then coalesce(exhibitor_task.done_at, now()) end,
             note = excluded.note
       returning template_id, done, done_at, note`,
      [deal_id, req.params.templateId, !!done, note],
    )
    // ผู้ออกบูธไม่มี app_user จึงบันทึกร่องรอยแบบไม่มี actor แต่บอกว่ามาจากพอร์ทัล
    await q(
      `insert into audit_log (actor_id, entity, entity_id, action, field, new_value)
       values (null, 'exhibitor_task', $1, 'portal', 'done', $2)`,
      [deal_id, String(!!done)],
    )
    res.json(rows[0])
  } catch (e) { next(e) }
})

// เพิ่มคนประจำบูธ ระบบบังคับเพดานบัตรตามแพ็กเกจ ไม่ต้องมาเถียงกันหน้างาน
r.post('/staff', needPortal, async (req, res, next) => {
  try {
    const { deal_id } = req.portal
    const { name, role = null, phone = null, email = null, badge_type = 'exhibitor' } = req.body ?? {}
    if (!name) return res.status(400).json({ error: 'ต้องมีชื่อ' })
    if (!['exhibitor', 'contractor'].includes(badge_type)) {
      return res.status(400).json({ error: 'ชนิดบัตรไม่ถูกต้อง' })
    }

    const cap = await q(
      `select coalesce(sum(case when $2 = 'exhibitor' then bt.badge_exhibitor
                                else bt.badge_contractor end), 0)::int as quota,
              (select count(*)::int from booth_staff
                where deal_id = $1 and badge_type = $2) as used
         from deal_item di
         join booth b on b.id = di.booth_id
         join booth_type bt on bt.id = b.booth_type_id
        where di.deal_id = $1`,
      [deal_id, badge_type],
    )
    const { quota, used } = cap.rows[0] ?? { quota: 0, used: 0 }
    if (used >= quota) {
      return res.status(409).json({ error: `บัตร${badge_type === 'exhibitor' ? 'ผู้ออกบูธ' : 'ผู้รับเหมา'}ครบ ${quota} ใบแล้ว` })
    }

    const { rows } = await q(
      `insert into booth_staff (deal_id, name, role, phone, email, badge_type)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, role, phone, email, badge_type`,
      [deal_id, name, role, phone, email, badge_type],
    )
    res.status(201).json(rows[0])
  } catch (e) { next(e) }
})

r.delete('/staff/:id', needPortal, async (req, res, next) => {
  try {
    const { rowCount } = await q(
      `delete from booth_staff where id = $1 and deal_id = $2`,
      [req.params.id, req.portal.deal_id],
    )
    if (!rowCount) return res.status(404).json({ error: 'ไม่พบรายชื่อนี้' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default r

/* เมลเตือนผู้ออกบูธว่ามีอะไรค้างส่ง
   กติกาสามข้อที่ห้ามพลาด เพราะปลายทางคือลูกค้าจริงที่จ่ายเงินแล้ว 56 ราย

   1. บริษัทหนึ่งได้เมลหนึ่งฉบับ รวมทุกงานที่ค้างไว้ในนั้น
      ไม่ใช่ 11 ฉบับตามจำนวนงาน
   2. งานที่วันจัดผ่านไปแล้วไม่ส่ง docs/exhibitor.md เตือนไว้ว่าวันที่ในข้อมูล
      เป็นของรอบที่ผ่านมา ถ้าไม่กันไว้ กำหนดส่งทุกงานจะกลายเป็นเลยกำหนดหมด
      แล้วยิงเมลรวดเดียวถึงทุกราย
   3. วันเดียวส่งซ้ำไม่ได้ เช็กจาก mail_log ไม่ใช่จากตัวแปรในหน่วยความจำ
      เพราะบน Vercel แต่ละคำขอคือโปรเซสใหม่ */
import { q } from '../db.js'
import { sendMail, alreadySent } from './mail.js'
import { exhibitorReminder } from './templates.js'

const WINDOW_DAYS = Number(process.env.REMINDER_WINDOW_DAYS || 14)

/* ดึงงานที่ยังไม่เสร็จของผู้ออกบูธ พร้อมคนที่ต้องรับเมล
   เลือกผู้ติดต่อหลักก่อน ถ้าไม่มีค่อยเอาคนที่มีอีเมลคนแรก
   ดีลที่ไม่มีอีเมลเลยก็ยังคืนออกมา จะได้รู้ว่าติดต่อไม่ได้ ไม่ใช่หายเงียบ */
export async function pendingByDeal ({ eventId = null, windowDays = WINDOW_DAYS } = {}) {
  const { rows } = await q(
    `with ev as (
       select id, name, venue, hall, start_date, move_in_from,
              coalesce(move_in_from, start_date) as ref_date
         from event
        where status in ('planning','selling','onsite')
          and coalesce(move_in_from, start_date) >= current_date
          and ($1::bigint is null or id = $1)
     ),
     booths as (
       select di.deal_id, string_agg(b.code, ', ' order by b.code) as booth_codes,
              min(bt.build) as build
         from deal_item di
         join booth b on b.id = di.booth_id
         left join booth_type bt on bt.id = b.booth_type_id
        group by di.deal_id
     ),
     contact as (
       select distinct on (company_id) company_id, email, name
         from contact_person
        where email is not null and email <> ''
        order by company_id, is_primary desc, id
     )
     select d.id as deal_id, d.event_id, d.owner_id,
            c.name as company, ct.email as contact_email, ct.name as contact_name,
            ow.email as owner_email,
            bo.booth_codes,
            ev.name as event_name, ev.venue, ev.hall,
            ev.start_date, ev.move_in_from,
            tt.id as template_id, tt.label, tt.required, tt.sort,
            coalesce(et.due_date, ev.ref_date - tt.due_offset_days) as due_date,
            (coalesce(et.due_date, ev.ref_date - tt.due_offset_days) - current_date) as days_left
       from deal d
       join ev on ev.id = d.event_id
       join company c on c.id = d.company_id
       left join contact ct on ct.company_id = d.company_id
       left join app_user ow on ow.id = d.owner_id
       left join booths bo on bo.deal_id = d.id
       join task_template tt on tt.event_id = d.event_id and tt.assigned_to = 'exhibitor'
       left join exhibitor_task et on et.deal_id = d.id and et.template_id = tt.id
      where d.status in ('confirmed','billed','paid')
        and coalesce(et.done, false) = false
        and (tt.applies_to is null or tt.applies_to = 'all' or tt.applies_to = bo.build)
        and (coalesce(et.due_date, ev.ref_date - tt.due_offset_days) - current_date) <= $2
      order by c.name, tt.sort, tt.id`,
    [eventId, windowDays],
  )

  const byDeal = new Map()
  for (const t of rows) {
    if (!byDeal.has(t.deal_id)) {
      byDeal.set(t.deal_id, {
        deal_id: t.deal_id,
        event_id: t.event_id,
        company: t.company,
        contact_email: t.contact_email,
        contact_name: t.contact_name,
        owner_email: t.owner_email,
        booth_codes: t.booth_codes,
        event: {
          name: t.event_name, venue: t.venue, hall: t.hall,
          start_date: t.start_date, move_in_from: t.move_in_from,
        },
        tasks: [],
      })
    }
    byDeal.get(t.deal_id).tasks.push({
      template_id: t.template_id,
      label: t.label,
      required: t.required,
      due_date: t.due_date,
      days_left: Number(t.days_left),
    })
  }
  return [...byDeal.values()]
}

/* ส่งจริง หรือแค่ดูว่าจะส่งถึงใครบ้าง
   dryRun เป็นค่าตั้งต้น การส่งต้องเป็นการตัดสินใจที่พิมพ์ออกมาชัด ๆ เท่านั้น */
export async function runReminders ({
  eventId = null, dryRun = true, ccOwner = true, windowDays = WINDOW_DAYS,
} = {}) {
  const digests = await pendingByDeal({ eventId, windowDays })
  const portalUrl = (process.env.PORTAL_URL || '').replace(/\/$/, '') || null
  const out = []

  for (const d of digests) {
    const late = d.tasks.filter((t) => t.days_left < 0).length
    const row = {
      deal_id: d.deal_id, company: d.company, to: d.contact_email,
      cc: ccOwner ? d.owner_email : null,
      booths: d.booth_codes, tasks: d.tasks.length, overdue: late,
    }


    /* ยังไม่ได้กรอกอีเมลผู้ติดต่อ ไม่ใช่ความผิดพลาดของระบบ เป็นข้อมูลที่ยังขาด
       ของเดิมปล่อยให้ไปตายที่ sendMail แล้วถูกบันทึกเป็น "ไม่สำเร็จ" ทุกคืน
       ทั้งที่ไม่มีอะไรให้แก้ในฝั่งโปรแกรม กลายเป็นเสียงรบกวนที่กลบของที่พังจริง
       ข้ามไปตรงนี้เลยและบอกให้ชัดว่าติดที่ยังไม่มีอีเมล จะได้รู้ว่าต้องไปกรอกที่ไหน */
    if (!d.contact_email) {
      out.push({ ...row, status: 'skipped',
        error: 'ยังไม่ได้กรอกอีเมลผู้ติดต่อของ ' + d.company })
      continue
    }
    const mail = exhibitorReminder({
      company: d.company,
      event: d.event,
      tasks: d.tasks,
      boothCodes: d.booth_codes,
      portalUrl,
    })
    if (dryRun) {
      out.push({ ...row, status: 'preview', subject: mail.subject, html: mail.html })
      continue
    }
    /* ด่านกันส่งซ้ำอยู่หลังการดูตัวอย่าง เพราะการดูตัวอย่างไม่ได้ส่งอะไรออกไป */
    if (await alreadySent('exhibitor_reminder', 'deal', d.deal_id)) {
      out.push({ ...row, status: 'duplicate', error: 'ส่งให้ดีลนี้ไปแล้วภายใน 20 ชั่วโมง' })
      continue
    }
    const res = await sendMail({
      ...mail,
      to: d.contact_email,
      cc: row.cc,
      template: 'exhibitor_reminder',
      entity: 'deal',
      entityId: d.deal_id,
      eventId: d.event_id,
    })
    out.push({ ...row, ...res })
  }
  return out
}

/* สรุปงานค้างรายสัปดาห์ ส่งให้เซลล์แต่ละคนเช้าวันจันทร์
   แยกไฟล์จาก reminders.js เพราะคนละกลุ่มผู้รับและคนละเหตุผล
   reminders คุยกับผู้ออกบูธ อันนี้คุยกับคนในทีม

   ส่งคนละหนึ่งฉบับต่อสัปดาห์ ไม่ใช่หนึ่งฉบับต่องาน
   เซลล์ที่ดูแลสามงานไม่ควรได้เมลสามฉบับเช้าวันจันทร์ จะเลิกอ่านเอา */
import { q } from '../db.js'
import { sendMail, alreadySent } from './mail.js'
import { repDigest } from './templates.js'

const DAY = 86400000

export async function runDigest ({ dryRun = false } = {}) {
  const out = []
  const rows = (await q(
    `select sa.id as agent_id, sa.name as rep, sa.kind, u.email,
            e.id as event_id, e.code, e.name as event,
            c.name as company, d.list_total, d.status,
            d.next_step, d.next_date::text as next_date,
            (select max(l.at) from deal_stage_log l
              where l.event_id = d.event_id and l.company_id = d.company_id
                and l.stage = d.status) as stage_since
       from deal d
       join event e on e.id = d.event_id
       join company c on c.id = d.company_id
       join sales_agent sa on sa.id = d.agent_id
       left join app_user u on u.id = sa.user_id
      where e.status in ('planning','selling','onsite')
        and d.status not in ('paid','lost')`)).rows

  /* รวมตามคนขาย ไม่ใช่ตามงาน ชื่องานไปอยู่ในบรรทัดของแต่ละดีลแทน */
  const byRep = new Map()
  for (const r of rows) {
    if (!byRep.has(r.agent_id)) {
      byRep.set(r.agent_id, { id: r.agent_id, rep: r.rep, kind: r.kind, email: r.email, deals: [] })
    }
    byRep.get(r.agent_id).deals.push(r)
  }

  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10)

  for (const rep of byRep.values()) {
    const late = [], soon = [], stuck = [], none = []
    for (const r of rep.deals) {
      const val = Number(r.list_total || 0)
      const where = r.event
      if (r.next_date && r.next_date < today) {
        late.push({ company: r.company, value: val,
          note: `${where} · นัดไว้ ${r.next_date}${r.next_step ? ' · ' + r.next_step : ''}` })
      } else if (r.next_date && r.next_date <= weekEnd) {
        soon.push({ company: r.company, value: val,
          note: `${where} · ${r.next_date}${r.next_step ? ' · ' + r.next_step : ''}` })
      } else if (!r.next_step) {
        none.push({ company: r.company, value: val, note: where })
      }
      if (r.stage_since) {
        const d = Math.floor((Date.now() - new Date(r.stage_since).getTime()) / DAY)
        if (d >= 21) stuck.push({ company: r.company, value: val, note: `${where} · ค้างที่ขั้นเดิมมา ${d} วัน` })
      }
    }
    const by = (a, b) => b.value - a.value
    const groups = [
      { label: 'เลยนัดแล้ว', urgent: true, rows: late.sort(by) },
      { label: 'ครบกำหนดสัปดาห์นี้', urgent: true, rows: soon.sort(by) },
      { label: 'ค้างขั้นเดิมเกิน 3 สัปดาห์', urgent: false, rows: stuck.sort(by) },
      { label: 'ยังไม่มีนัดถัดไป', urgent: false, rows: none.sort(by) },
    ]
    const total = groups.reduce((n, g) => n + g.rows.length, 0)
    const events = [...new Set(rep.deals.map((d) => d.event))]
    const base = { rep: rep.rep, to: rep.email, items: total, events: events.length }

    // ไม่มีอะไรค้างก็ไม่ส่ง เมลที่ไม่มีเนื้อหาทำให้คนเลิกอ่านฉบับที่มีเนื้อหาไปด้วย
    if (!total) { out.push({ ...base, status: 'skipped', error: 'ไม่มีงานค้าง' }); continue }
    /* บูธแจกฟรีกับบูธส่วนกลางถูกบันทึกเป็น "เซลล์" ชนิด house เพื่อให้ยอดลงถูกช่อง
       แต่ไม่ใช่คน จึงไม่มีใครให้ส่งถึง ไม่ใช่ข้อผิดพลาด */
    if (rep.kind === 'house') {
      out.push({ ...base, status: 'skipped', error: 'ไม่ใช่คน เป็นช่องบันทึกบูธส่วนกลาง' }); continue
    }
    if (!rep.email) {
      out.push({ ...base, status: 'skipped', error: 'ยังไม่ได้ผูกบัญชีผู้ใช้กับเซลล์คนนี้' }); continue
    }
    const mail = repDigest({
      rep: rep.rep,
      event: { name: events.length > 1 ? `${events.length} งานที่ดูแลอยู่` : events[0] },
      groups, url: (process.env.WEB_ORIGIN || '') + '/app',
    })
    /* ดูตัวอย่างต้องดูได้เสมอ ด่านกันส่งซ้ำอยู่หลังจากนี้ เพราะการดูตัวอย่างไม่ได้ส่งอะไรออกไป
       ของเดิมเช็คก่อน พอเพิ่งส่งจริงไปรอบหนึ่งก็เปิดดูตัวอย่างไม่ได้ทั้งสัปดาห์ */
    if (dryRun) { out.push({ ...base, status: 'preview', subject: mail.subject, html: mail.html }); continue }
    if (await alreadySent('rep_digest', 'agent', rep.id)) {
      out.push({ ...base, status: 'duplicate', error: 'ส่งให้คนนี้ไปแล้วในรอบนี้' }); continue
    }
    const res = await sendMail({ ...mail, to: rep.email, template: 'rep_digest',
      entity: 'agent', entityId: rep.id, eventId: rep.deals[0].event_id })
    out.push({ ...base, ...res })
  }
  return out
}

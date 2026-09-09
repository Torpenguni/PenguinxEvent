/* ส่งเมลติดตามลูกค้าจากในระบบ แล้วประวัติการติดต่อเกิดขึ้นเอง
   docs/sales.md บอกว่าของที่ใกล้เคียงประวัติการติดต่อที่สุดตอนนี้
   คือช่อง "ได้รับอีเมลเรียบร้อย" ในชีต ซึ่งบอกได้แค่ว่าเคยติดต่อ
   ไม่รู้ว่าเมื่อไหร่ ใครส่ง หรือคุยอะไรไว้ ทุกฉบับที่ส่งผ่านที่นี่
   จะมีแถวใน mail_log ผูกกับดีล และเป็นคำตอบของคำถามนั้น */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need } from '../auth.js'
import { sendMail } from '../lib/mail.js'
import { dealMessage } from '../lib/templates.js'

const r = Router()

// ดีลนี้เป็นของเราหรือเปล่า เซลล์ที่เห็นเฉพาะดีลตัวเองห้ามส่งเมลในนามดีลคนอื่น
async function ownDeal (req, dealId) {
  const { rows } = await q(
    `select d.id, d.owner_id, d.event_id, c.name as company, c.id as company_id
       from deal d join company c on c.id = d.company_id where d.id = $1`, [dealId])
  const deal = rows[0]
  if (!deal) return { error: 'ไม่พบดีลนี้', status: 404 }
  if (req.scope === 'own' && String(deal.owner_id) !== String(req.user.id)) {
    return { error: 'ดีลนี้ไม่ใช่ของคุณ', status: 403 }
  }
  return { deal }
}

// รายชื่อผู้ติดต่อของบริษัทเจ้าของดีล ใช้เป็นตัวเลือกผู้รับบนหน้าจอ
r.get('/:id/contacts', need('deal'), async (req, res, next) => {
  try {
    const { deal, error, status } = await ownDeal(req, req.params.id)
    if (error) return res.status(status).json({ error })
    const { rows } = await q(
      `select id, name, position, email, is_primary
         from contact_person
        where company_id = $1 and email is not null and email <> ''
        order by is_primary desc, name`,
      [deal.company_id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

// ประวัติการติดต่อของดีลนี้ อ่านจาก mail_log ตรง ๆ ไม่มีตารางซ้ำซ้อน
r.get('/:id/emails', need('deal'), async (req, res, next) => {
  try {
    const { error, status } = await ownDeal(req, req.params.id)
    if (error) return res.status(status).json({ error })
    const { rows } = await q(
      `select id, "to", cc, subject, template, status, error, at
         from mail_log where entity = 'deal' and entity_id = $1 order by at desc`,
      [req.params.id],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

r.post('/:id/emails', need('deal', 'write'), async (req, res, next) => {
  try {
    const { deal, error, status } = await ownDeal(req, req.params.id)
    if (error) return res.status(status).json({ error })

    const { to, subject, body, cc_me = true } = req.body ?? {}
    if (!to || !subject || !body) return res.status(400).json({ error: 'ต้องมีผู้รับ หัวข้อ และเนื้อความ' })

    /* ส่งได้เฉพาะอีเมลที่อยู่ในรายชื่อผู้ติดต่อของบริษัทนี้
       ไม่ใช่ที่อยู่อะไรก็ได้ที่พิมพ์เข้ามา ระบบนี้ไม่ใช่เครื่องส่งเมลทั่วไป */
    const ok = await q(
      `select 1 from contact_person where company_id = $1 and lower(email) = lower($2)`,
      [deal.company_id, to])
    if (!ok.rowCount) {
      return res.status(400).json({ error: 'อีเมลนี้ไม่ได้อยู่ในรายชื่อผู้ติดต่อของบริษัทนี้' })
    }

    const mail = dealMessage({
      subject, body, company: deal.company,
      sender: { name: req.user.name, email: req.user.email },
    })
    const out = await sendMail({
      ...mail,
      to,
      cc: cc_me ? req.user.email : null,
      template: 'deal_message',
      entity: 'deal',
      entityId: deal.id,
      eventId: deal.event_id,
    })
    res.status(out.status === 'failed' ? 502 : 201).json(out)
  } catch (e) { next(e) }
})

export default r

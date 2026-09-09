/* ทางออกเดียวของอีเมลทั้งระบบ
   route ไหนก็ตามที่อยากส่งเมล ต้องเรียกผ่าน sendMail ที่นี่เท่านั้น
   ห้ามเรียก Resend ตรง ๆ เพราะสามอย่างนี้ต้องเกิดขึ้นทุกครั้งไม่มีข้อยกเว้น
     1. มีแถวใน mail_log เสมอ ไม่ว่าผลจะเป็นอะไร
     2. สวิตช์ MAIL_ENABLED กันการยิงเมลจริงออกไปหาลูกค้า 56 รายโดยไม่ตั้งใจ
     3. MAIL_REDIRECT_TO เปลี่ยนผู้รับทุกฉบับไปที่กล่องทดสอบ

   และไม่มี fire-and-forget ที่นี่ ผู้เรียกต้อง await เสมอ
   เมลที่ส่งไม่สำเร็จแล้วเงียบ แย่กว่าเมลที่ไม่ได้ส่ง เพราะทีมเชื่อว่าส่งไปแล้ว */
import { Resend } from 'resend'
import { q } from '../db.js'

const API_KEY  = process.env.RESEND_API_KEY || ''
const FROM     = process.env.MAIL_FROM || ''
const ENABLED  = process.env.MAIL_ENABLED === 'true'
const REDIRECT = process.env.MAIL_REDIRECT_TO || ''

const resend = API_KEY ? new Resend(API_KEY) : null

const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/))
  .map((s) => String(s).trim()).filter(Boolean)

/* "ไม่ได้ตั้งค่า" กับ "พิมพ์ชื่อ env ผิด" หน้าตาเหมือนกันเป๊ะตอนรัน
   ฟังก์ชันนี้จึงบอกว่าขาดตัวไหนโดยเรียกชื่อมันตรง ๆ */
export function mailStatus () {
  const missing = []
  if (!API_KEY) missing.push('RESEND_API_KEY')
  if (!FROM) missing.push('MAIL_FROM')
  return {
    enabled: ENABLED,
    configured: missing.length === 0,
    missing,
    from: FROM || null,
    redirectTo: REDIRECT || null,
    canSend: ENABLED && missing.length === 0,
  }
}

export function mailBootReport () {
  const s = mailStatus()
  if (s.canSend) {
    console.log(`อีเมล: ส่งได้ จาก ${s.from}`
      + (s.redirectTo ? ` (เปลี่ยนผู้รับทุกฉบับไปที่ ${s.redirectTo})` : ''))
    return s
  }
  const why = !s.configured
    ? `ยังไม่ได้ตั้ง ${s.missing.join(' และ ')}`
    : 'MAIL_ENABLED ไม่ใช่ true'
  console.log(`อีเมล: ยังไม่ส่งจริง (${why}) ทุกฉบับจะถูกบันทึกเป็น skipped ใน mail_log`)
  return s
}

async function record (row) {
  try {
    const { rows } = await q(
      `insert into mail_log ("to", cc, redirected_to, subject, template,
                             entity, entity_id, event_id, status, provider_id, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, status`,
      [row.to, row.cc, row.redirectedTo, row.subject, row.template,
       row.entity ?? null, row.entityId ?? null, row.eventId ?? null,
       row.status, row.providerId ?? null, row.error ?? null],
    )
    return rows[0]
  } catch (e) {
    // บันทึกไม่ลงถือว่าร้ายแรง ต้องดังพอให้เห็นใน log ของเซิร์ฟเวอร์
    console.error('บันทึก mail_log ไม่สำเร็จ:', e.message, row)
    return null
  }
}

/* ส่งเมลหนึ่งฉบับ คืนผลว่าเกิดอะไรขึ้นจริง ๆ ไม่ throw ให้ route ล่ม
   เพราะการเชิญคนหนึ่งคนไม่สำเร็จ ไม่ควรทำให้ทั้งคำขอพัง
   แต่ผู้เรียกต้องอ่านค่า status ที่คืนไปแล้วบอกผู้ใช้ตามจริง */
export async function sendMail ({
  to, cc, subject, html, text,
  template, entity, entityId, eventId,
}) {
  const toList = list(to)
  const ccList = list(cc)
  const base = {
    to: toList.join(', '),
    cc: ccList.join(', ') || null,
    redirectedTo: null,
    subject, template, entity, entityId, eventId,
  }

  if (!toList.length) {
    return { ...await record({ ...base, status: 'failed', error: 'ไม่มีที่อยู่ผู้รับ' }),
             status: 'failed', error: 'ไม่มีที่อยู่ผู้รับ' }
  }

  const s = mailStatus()
  if (!s.enabled) {
    const error = s.configured
      ? 'MAIL_ENABLED ไม่ใช่ true'
      : `MAIL_ENABLED ไม่ใช่ true และยังไม่ได้ตั้ง ${s.missing.join(' และ ')}`
    await record({ ...base, status: 'skipped', error })
    return { status: 'skipped', error }
  }
  if (!s.configured) {
    const error = `ตั้งค่าไม่ครบ ขาด ${s.missing.join(' และ ')}`
    await record({ ...base, status: 'failed', error })
    return { status: 'failed', error }
  }

  // ปลายทางจริงตอนทดสอบ ผู้รับตัวจริงยังถูกบันทึกไว้ในคอลัมน์ to ตามเดิม
  const realTo = REDIRECT ? list(REDIRECT) : toList
  const realCc = REDIRECT ? [] : ccList
  base.redirectedTo = REDIRECT ? realTo.join(', ') : null

  try {
    const res = await resend.emails.send({
      from: FROM,
      to: realTo,
      ...(realCc.length ? { cc: realCc } : {}),
      subject: REDIRECT ? `[ทดสอบ→${toList.join(',')}] ${subject}` : subject,
      html,
      ...(text ? { text } : {}),
    })
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error))
    await record({ ...base, status: 'sent', providerId: res.data?.id ?? null })
    return { status: 'sent', id: res.data?.id ?? null }
  } catch (e) {
    await record({ ...base, status: 'failed', error: e.message })
    return { status: 'failed', error: e.message }
  }
}

// เคยส่งเมลแม่แบบนี้ให้สิ่งนี้ไปแล้วในช่วงกี่ชั่วโมงที่ผ่านมาหรือยัง
// ใช้กันเมลเตือนซ้ำ ถามฐานข้อมูลแทนที่จะจำเองในหน่วยความจำ
// เพราะบน Vercel แต่ละคำขอคือโปรเซสใหม่ ความจำในตัวแปรไม่เหลือข้ามคำขอ
export async function alreadySent (template, entity, entityId, withinHours = 20) {
  const { rows } = await q(
    `select 1 from mail_log
      where template = $1 and entity = $2 and entity_id = $3
        and status in ('sent','skipped')
        and at > now() - ($4 || ' hours')::interval
      limit 1`,
    [template, entity, entityId, String(withinHours)],
  )
  return rows.length > 0
}

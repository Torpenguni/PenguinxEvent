/* แชร์งานให้คนนอก และส่งคำเชิญทางอีเมล
   ตาราง event_share ออกแบบไว้ครบอยู่แล้ว ขาดแค่สองอย่าง
   ตัวลิงก์รับคำเชิญ กับตัวส่งเมลบอกคนที่ถูกเชิญว่ามีคนแชร์ให้ */
import { Router } from 'express'
import crypto from 'node:crypto'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'
import { sendMail } from '../lib/mail.js'
import { shareInvite } from '../lib/templates.js'

const r = Router()
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const INVITE_DAYS = 30

const appBase = () => (process.env.WEB_ORIGIN || '').split(',')[0]?.replace(/\/$/, '') || ''

// อีเมลนอกโดเมนบริษัทถือเป็นคนนอกเสมอ กติกาเดิมใน docs/share.md
const COMPANY_DOMAIN = process.env.COMPANY_DOMAIN || 'penguinx.co'
const isExternal = (email) => !String(email).toLowerCase().endsWith('@' + COMPANY_DOMAIN)

async function issueToken (shareId) {
  const key = crypto.randomBytes(32).toString('base64url')
  await q(
    `update event_share set invite_token = $2,
            token_expires_at = now() + ($3 || ' days')::interval
      where id = $1`,
    [shareId, sha(key), String(INVITE_DAYS)],
  )
  return key
}

async function mailInvite (share, actor) {
  const { rows } = await q(
    `select e.id, e.name, e.venue, e.hall, e.start_date from event e where e.id = $1`,
    [share.event_id],
  )
  const event = rows[0]
  const key = await issueToken(share.id)
  const url = `${appBase()}/invite#${key}`
  const mail = shareInvite({
    event,
    inviter: actor?.name || 'ทีมงาน Penguin X',
    permission: share.permission,
    scopeModule: share.scope_module,
    url,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000),
    note: share.note,
  })
  const out = await sendMail({
    ...mail,
    to: share.email,
    template: 'share_invite',
    entity: 'event_share',
    entityId: share.id,
    eventId: share.event_id,
  })
  // คืน url ให้หน้าจอด้วย เผื่อเมลยังปิดอยู่ ทีมจะได้คัดลอกส่งเองได้ก่อน
  return { ...out, url, to: share.email }
}

r.get('/', need('share'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select s.id, s.event_id, s.email, s.permission, s.scope_module, s.external,
              s.invited_at, s.accepted_at, s.revoked_at, s.last_seen_at, s.note,
              u.name as invited_by,
              (select status from mail_log m
                where m.entity = 'event_share' and m.entity_id = s.id
                order by m.at desc limit 1) as last_mail
         from event_share s
         left join app_user u on u.id = s.invited_by
        where ($1::bigint is null or s.event_id = $1)
        order by s.invited_at desc`,
      [req.query.event ?? null],
    )
    res.json(rows)
  } catch (e) { next(e) }
})

r.post('/', need('share', 'write'), async (req, res, next) => {
  try {
    const { event_id, email, permission = 'view', scope_module = null, note = null } = req.body ?? {}
    if (!event_id || !email) return res.status(400).json({ error: 'ต้องมีงานและอีเมล' })
    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'สิทธิ์ต้องเป็น view หรือ edit' })
    }
    /* คนนอกได้ดูอย่างเดียวเสมอเป็นค่าตั้งต้น ต้องกดเปลี่ยนเองทีหลังถ้าจะให้แก้
       กันการเผลอให้สิทธิ์แก้ตอนพิมพ์เร็ว ๆ ตามที่ docs/share.md กำหนดไว้ */
    const external = isExternal(email)
    const perm = external ? 'view' : permission

    const { rows } = await q(
      `insert into event_share (event_id, email, permission, scope_module, external,
                                invited_by, note)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (event_id, email) do update
         set permission = excluded.permission, scope_module = excluded.scope_module,
             note = excluded.note, revoked_at = null, invited_at = now(),
             invited_by = excluded.invited_by
       returning *`,
      [event_id, email, perm, scope_module, external, req.user.id, note],
    )
    const share = rows[0]
    await audit(req, 'event_share', share.id, 'invite', 'email', null, email)
    const mail = await mailInvite(share, req.user)
    res.status(201).json({ ...share, mail })
  } catch (e) { next(e) }
})

r.post('/:id/resend', need('share', 'write'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select * from event_share where id = $1 and revoked_at is null`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบคำเชิญนี้ หรือถูกถอนไปแล้ว' })
    res.json(await mailInvite(rows[0], req.user))
  } catch (e) { next(e) }
})

// ถอนสิทธิ์เป็นสองจังหวะ เก็บ revoked_at ไว้ ไม่ลบแถวทิ้ง
r.post('/:id/revoke', need('share', 'write'), async (req, res, next) => {
  try {
    const { rowCount } = await q(
      `update event_share set revoked_at = now(), invite_token = null
        where id = $1 and revoked_at is null`, [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'ไม่พบคำเชิญนี้ หรือถอนไปแล้ว' })
    await audit(req, 'event_share', req.params.id, 'revoke')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* รับคำเชิญ เปิดได้โดยไม่ต้องล็อกอิน
   ถ้าอีเมลนั้นมีบัญชีในระบบอยู่แล้ว ผูก user_id ให้เลย
   ถ้ายังไม่มี บันทึกว่ารับคำเชิญแล้วและบอกให้เขาติดต่อผู้เชิญเพื่อเปิดบัญชี
   (ทางเข้าสำหรับคนนอกที่ไม่มีบัญชีเป็นคนละเรื่อง อยู่ในพอร์ทัลผู้ออกบูธ) */
r.post('/accept', async (req, res, next) => {
  try {
    const key = req.body?.key
    if (!key) return res.status(400).json({ error: 'ลิงก์ไม่ครบ' })
    const { rows } = await q(
      `select s.*, e.name as event_name, e.code as event_code
         from event_share s join event e on e.id = s.event_id
        where s.invite_token = $1 and s.revoked_at is null
          and s.token_expires_at > now()`,
      [sha(key)],
    )
    const share = rows[0]
    if (!share) return res.status(401).json({ error: 'ลิงก์นี้ใช้ไม่ได้แล้ว ขอคำเชิญใหม่จากผู้เชิญ' })

    const acct = await q(`select id from app_user where email = $1 and active`, [share.email])
    await q(
      `update event_share
          set accepted_at = coalesce(accepted_at, now()),
              last_seen_at = now(),
              user_id = coalesce(user_id, $2)
        where id = $1`,
      [share.id, acct.rows[0]?.id ?? null],
    )
    res.json({
      event: { code: share.event_code, name: share.event_name },
      email: share.email,
      permission: share.permission,
      scope_module: share.scope_module,
      has_account: !!acct.rows[0],
    })
  } catch (e) { next(e) }
})

export default r

/* จัดการผู้ใช้ในทีม และเชิญด้วยอีเมล
   docs/access.md เขียนไว้ตั้งแต่ต้นว่า "แอดมินเชิญด้วยอีเมล ผู้ใช้ตั้งรหัสผ่านเอง"
   แต่ของจริงต้องรัน scripts/create_user.js บนเครื่องที่ต่อฐานข้อมูลได้
   แล้วบอกรหัสผ่านชั่วคราวกันปากเปล่า ไฟล์นี้ทำให้เอกสารกับของจริงตรงกัน
   และรหัสผ่านไม่ต้องวิ่งผ่านแชทอีกต่อไป */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'
import { sendMail } from '../lib/mail.js'
import { userInvite } from '../lib/templates.js'

const r = Router()
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const INVITE_DAYS = 7

const appBase = () => (process.env.WEB_ORIGIN || '').split(',')[0]?.replace(/\/$/, '') || ''

async function mailUserInvite (user, actor) {
  const key = crypto.randomBytes(32).toString('base64url')
  const { rows } = await q(
    `update app_user set invite_token = $2,
            invite_expires_at = now() + ($3 || ' days')::interval,
            invited_by = coalesce(invited_by, $4), invited_at = now()
      where id = $1 returning invite_expires_at`,
    [user.id, sha(key), String(INVITE_DAYS), actor?.id ?? null],
  )
  const url = `${appBase()}/set-password#${key}`
  const mail = userInvite({
    user,
    inviter: actor?.name || 'ผู้ดูแลระบบ',
    url,
    expiresAt: rows[0].invite_expires_at,
  })
  const out = await sendMail({
    ...mail,
    to: user.email,
    template: 'user_invite',
    entity: 'app_user',
    entityId: user.id,
  })
  return { ...out, url, to: user.email }
}

r.get('/', need('user'), async (_req, res, next) => {
  try {
    const { rows } = await q(
      `select u.id, u.email, u.name, u.role, u.active, u.invited_at, u.activated_at,
              u.last_login_at, (u.password_hash is not null) as has_password,
              (u.invite_token is not null and u.invite_expires_at > now()) as invite_pending,
              i.name as invited_by,
              (select status from mail_log m
                where m.entity = 'app_user' and m.entity_id = u.id
                order by m.at desc limit 1) as last_mail
         from app_user u
         left join app_user i on i.id = u.invited_by
        order by u.active desc, u.name`,
    )
    res.json(rows)
  } catch (e) { next(e) }
})

r.post('/invite', need('user', 'write'), async (req, res, next) => {
  try {
    const { email, name, role } = req.body ?? {}
    if (!email || !name || !role) return res.status(400).json({ error: 'ต้องมีอีเมล ชื่อ และบทบาท' })
    const ok = await q(`select 1 from role where code = $1`, [role])
    if (!ok.rowCount) return res.status(400).json({ error: 'ไม่มีบทบาทนี้' })

    /* เชิญซ้ำคนเดิมได้ ถือว่าเป็นการส่งลิงก์ใหม่ ไม่ใช่ error
       แต่ห้ามล้าง password_hash ของคนที่ตั้งรหัสไปแล้ว ไม่งั้นเชิญซ้ำ = เตะเขาออกจากระบบ */
    const { rows } = await q(
      `insert into app_user (email, name, role, active, must_change_password)
       values ($1,$2,$3,true,true)
       on conflict (email) do update set name = excluded.name, role = excluded.role, active = true
       returning id, email, name, role, (password_hash is not null) as has_password`,
      [email, name, role],
    )
    const user = rows[0]
    await audit(req, 'app_user', user.id, 'invite', 'email', null, email)
    const mail = await mailUserInvite(user, req.user)
    res.status(201).json({ ...user, mail })
  } catch (e) { next(e) }
})

r.post('/:id/resend', need('user', 'write'), async (req, res, next) => {
  try {
    const { rows } = await q(
      `select id, email, name, role from app_user where id = $1 and active`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' })
    res.json(await mailUserInvite(rows[0], req.user))
  } catch (e) { next(e) }
})

// ปิดการใช้งานแทนการลบ ประวัติในระบบยังต้องอ้างถึงคนคนนี้ได้
r.post('/:id/deactivate', need('user', 'write'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'ปิดบัญชีตัวเองไม่ได้' })
    }
    const { rowCount } = await q(
      `update app_user set active = false, invite_token = null where id = $1 and active`,
      [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'ไม่พบผู้ใช้ที่เปิดใช้งานอยู่' })
    await q(`update auth_session set revoked_at = now()
              where user_id = $1 and revoked_at is null`, [req.params.id])
    await audit(req, 'app_user', req.params.id, 'deactivate')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* ตั้งรหัสผ่านจากลิงก์ในเมล เปิดได้โดยไม่ต้องล็อกอิน
   ตัวลิงก์คือสิ่งที่พิสูจน์ตัวตน จึงใช้ได้ครั้งเดียวแล้วถูกล้างทิ้ง */
export const setPassword = async (req, res, next) => {
  try {
    const { key, password } = req.body ?? {}
    if (!key || !password) return res.status(400).json({ error: 'ต้องมีลิงก์และรหัสผ่าน' })
    if (String(password).length < 10) {
      return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร' })
    }
    const { rows } = await q(
      `select id, email, name, role from app_user
        where invite_token = $1 and invite_expires_at > now() and active`,
      [sha(key)],
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'ลิงก์นี้ใช้ไม่ได้แล้ว ขอลิงก์ใหม่จากผู้ดูแลระบบ' })

    await q(
      `update app_user
          set password_hash = $2, must_change_password = false,
              activated_at = coalesce(activated_at, now()),
              invite_token = null, invite_expires_at = null
        where id = $1`,
      [user.id, await bcrypt.hash(password, 10)],
    )
    res.json({ ok: true, email: user.email })
  } catch (e) { next(e) }
}

export default r

/* ทางเข้าของผู้ออกบูธ แยกจาก auth.js ของพนักงานทั้งเส้น
   คนละชนิด token คนละตาราง และไม่มีทางไปแตะ role_permission ได้เลย */
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { q } from './db.js'

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

// ลิงก์เชิญ ทีมเราเป็นคนสร้างแล้วส่งให้ผู้ออกบูธเอง
export async function createLink(dealId, email, days, actorId) {
  const key = crypto.randomBytes(32).toString('base64url')
  const { rows } = await q(
    `insert into portal_access (deal_id, email, token_hash, created_by, expires_at)
     values ($1, $2, $3, $4, now() + ($5 || ' days')::interval)
     returning id, email, expires_at`,
    [dealId, email, sha(key), actorId ?? null, String(days)],
  )
  return { ...rows[0], key }   // key โชว์ได้ครั้งเดียว หลังจากนี้เหลือแต่แฮช
}

// ผู้ออกบูธเปิดลิงก์ แลกเป็น token ที่ใช้เรียก API ต่อได้
export async function exchange(key) {
  const { rows } = await q(
    `select id, deal_id, email from portal_access
      where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [sha(key)],
  )
  const access = rows[0]
  if (!access) {
    const err = new Error('ลิงก์นี้ใช้ไม่ได้แล้ว ติดต่อทีมงานเพื่อขอลิงก์ใหม่')
    err.status = 401
    throw err
  }
  await q(
    `update portal_access set accepted_at = coalesce(accepted_at, now()), last_seen_at = now()
      where id = $1`,
    [access.id],
  )
  const token = jwt.sign(
    { kind: 'portal', aid: access.id, did: access.deal_id },
    process.env.JWT_SECRET,
    { expiresIn: '12h' },
  )
  return { token, deal_id: access.deal_id, email: access.email }
}

/* อ่าน token ของผู้ออกบูธแล้วแนบ req.portal
   เช็กสถานะจาก portal_access ทุกครั้ง ถอนสิทธิ์แล้วมีผลทันที ไม่ต้องรอ token หมดอายุ */
export async function attachPortal(req, _res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!raw) return next()
  try {
    const claim = jwt.verify(raw, process.env.JWT_SECRET)
    if (claim.kind !== 'portal') return next()
    const { rows } = await q(
      `select pa.id, pa.deal_id, pa.email, d.event_id
         from portal_access pa
         join deal d on d.id = pa.deal_id
        where pa.id = $1 and pa.revoked_at is null and pa.expires_at > now()
          and d.status not in ('lost','cancelled')`,
      [claim.aid],
    )
    if (!rows[0]) return next()
    req.portal = rows[0]
    q(`update portal_access set last_seen_at = now() where id = $1`, [rows[0].id]).catch(() => {})
  } catch {
    /* token เสียหรือหมดอายุ ปล่อยให้ needPortal ตอบ 401 เอง */
  }
  next()
}

export function needPortal(req, res, next) {
  if (!req.portal) return res.status(401).json({ error: 'ต้องเปิดจากลิงก์ที่ทีมงานส่งให้' })
  next()
}

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { q } from './db.js'

const DAY = 86400000
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

export async function login(email, password, ip, ua) {
  // นับความพยายามที่ผิดก่อน กันเดารหัสผ่าน
  const recent = await q(
    `select count(*)::int as n from login_attempt
      where email = $1 and ok = false and at > now() - interval '15 minutes'`,
    [email],
  )
  if (recent.rows[0].n >= 8) {
    const err = new Error('ลองผิดหลายครั้งเกินไป รออีก 15 นาที')
    err.status = 429
    throw err
  }

  const { rows } = await q(
    `select id, email, name, role, password_hash, active from app_user where email = $1`,
    [email],
  )
  const user = rows[0]
  const ok = user && user.active && user.password_hash
    && (await bcrypt.compare(password, user.password_hash))

  await q(`insert into login_attempt (email, ip, ok) values ($1, $2, $3)`, [email, ip, !!ok])
  if (!ok) {
    const err = new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    err.status = 401
    throw err
  }

  /* ค้างได้ 30 วัน ของเดิม 12 ชั่วโมง แปลว่าทีมต้องล็อกอินใหม่ทุกเช้า
     ปรับได้ด้วย SESSION_DAYS ถ้าอยากสั้นลงตอนแยกบัญชีรายคนแล้ว */
  const days = Number(process.env.SESSION_DAYS || 30)
  const token = jwt.sign({ uid: user.id }, process.env.JWT_SECRET, { expiresIn: days + 'd' })
  await q(
    `insert into auth_session (user_id, token_hash, expires_at, ip, user_agent)
     values ($1, $2, now() + ($5 || ' days')::interval, $3, $4)`,
    [user.id, sha(token), ip, ua, String(days)],
  )
  await q(`update app_user set last_login_at = now() where id = $1`, [user.id])

  delete user.password_hash
  return { token, user }
}

export async function logout(token) {
  await q(`update auth_session set revoked_at = now() where token_hash = $1`, [sha(token)])
}

// อ่าน token แล้วแนบ user กับตารางสิทธิ์ของ role นั้นไว้ที่ req
export async function attachUser(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!raw) return next()
  try {
    const { uid } = jwt.verify(raw, process.env.JWT_SECRET)
    const live = await q(
      `select 1 from auth_session
        where token_hash = $1 and revoked_at is null and expires_at > now()`,
      [sha(raw)],
    )
    if (!live.rowCount) return next()

    const { rows } = await q(
      `select id, email, name, role, agent_id from app_user where id = $1 and active`,
      [uid],
    )
    if (!rows[0]) return next()
    req.user = rows[0]
    req.token = raw

    const perms = await q(
      `select module, level, scope from role_permission where role = $1`,
      [rows[0].role],
    )
    req.perms = Object.fromEntries(perms.rows.map((p) => [p.module, p]))
    q(`update auth_session set last_seen_at = now() where token_hash = $1`, [sha(raw)]).catch(() => {})
  } catch {
    /* token เสียหรือหมดอายุ ปล่อยให้ require() ตอบ 401 เอง */
  }
  next()
}

const RANK = { none: 0, read: 1, write: 2, approve: 3 }

// ตรวจสิทธิ์ที่เซิร์ฟเวอร์เสมอ การซ่อนเมนูบนหน้าจอไม่ใช่การกันสิทธิ์
export function require(module, level = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' })
    const p = req.perms?.[module]
    if (!p || RANK[p.level] < RANK[level]) {
      return res.status(403).json({ error: `บทบาทนี้ไม่มีสิทธิ์ ${module}` })
    }
    req.scope = p.scope
    next()
  }
}

export async function audit(req, entity, id, action, field, oldV, newV) {
  await q(
    `insert into audit_log (actor_id, entity, entity_id, action, field, old_value, new_value)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [req.user?.id ?? null, entity, id, action, field ?? null,
     oldV == null ? null : String(oldV), newV == null ? null : String(newV)],
  )
}

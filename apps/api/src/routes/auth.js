import { Router } from 'express'
import { login, logout } from '../auth.js'

const r = Router()

r.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {}
    if (!email || !password) return res.status(400).json({ error: 'กรอกอีเมลและรหัสผ่าน' })
    const out = await login(email, password, req.ip, req.get('user-agent'))
    res.json(out)
  } catch (e) { next(e) }
})

r.post('/logout', async (req, res, next) => {
  try {
    if (req.token) await logout(req.token)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// หน้าเว็บเรียกอันนี้ตอนเปิด เพื่อรู้ว่าตัวเองเป็นใครและเห็นเมนูอะไรได้
r.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' })
  res.json({ user: req.user, permissions: req.perms })
})

export default r

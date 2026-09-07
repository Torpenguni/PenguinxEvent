#!/usr/bin/env node
// เพิ่มผู้ใช้ ระบบไม่มีหน้าสมัครเอง แอดมินเชิญเท่านั้น
//   node scripts/create_user.js somchai@penguinx.co "สมชาย" admin
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import pg from 'pg'

const [email, name, role = 'sales'] = process.argv.slice(2)
if (!email || !name) {
  console.error('ใช้: node scripts/create_user.js <email> <ชื่อ> [role]')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

// รหัสผ่านชั่วคราว ผู้ใช้ต้องเปลี่ยนตอนเข้าครั้งแรก
const temp = crypto.randomBytes(6).toString('base64url')
const hash = await bcrypt.hash(temp, 12)

const { rows } = await pool.query(
  `insert into app_user (email, name, role, password_hash, invited_at, must_change_password)
   values ($1, $2, $3, $4, now(), true)
   on conflict (email) do update set name = excluded.name, role = excluded.role
   returning id, email, role`,
  [email, name, role, hash],
)

console.log('สร้างผู้ใช้แล้ว:', rows[0])
console.log('รหัสผ่านชั่วคราว:', temp)
console.log('ส่งให้เจ้าตัวทางช่องทางที่ปลอดภัย และให้เปลี่ยนทันทีที่เข้าครั้งแรก')
await pool.end()

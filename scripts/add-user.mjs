/* เปิดบัญชีให้อีเมลจริง ใช้รหัสชุดเดียวกับที่ทีมใช้อยู่
   ใช้: node scripts/add-user.mjs อีเมล "ชื่อ" บทบาท */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pg from 'pg'
const [email, name, role = 'admin'] = process.argv.slice(2)
if (!email) { console.log('ต้องบอกอีเมล'); process.exit(1) }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const hash = await bcrypt.hash(process.env.SEED_PASSWORD || 'pxe-setup-2027', 10)
const { rows } = await pool.query(
  `insert into app_user (email, name, role, password_hash, must_change_password, active)
   values ($1,$2,$3,$4,false,true)
   on conflict (email) do update set password_hash = excluded.password_hash,
     active = true, must_change_password = false, name = excluded.name, role = excluded.role
   returning id, email, name, role`, [email, name || email.split('@')[0], role, hash])
console.log('พร้อมใช้:', rows[0].email, '| ชื่อ', rows[0].name, '| บทบาท', rows[0].role)
process.exit(0)

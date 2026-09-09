/* นำเข้าข้อมูลจากไฟล์ต้นแบบ (app4.json) ลงฐานข้อมูลจริง
   รันซ้ำได้ ล้างข้อมูลของงานนั้นก่อนแล้วใส่ใหม่ ไม่แตะงานอื่น */
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const file = process.argv[2] || 'prototypes/app4.json'
const D = JSON.parse(fs.readFileSync(file, 'utf8'))
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (t, p) => pool.query(t, p)
const one = async (t, p) => (await q(t, p)).rows[0]

import { writeEvent } from '../apps/api/src/writeEvent.js'

async function main () {
  await q('begin')

  // ---- ผู้ใช้ตั้งต้น หนึ่งคนต่อหนึ่งบทบาท รหัสผ่านชั่วคราว ต้องเปลี่ยนตอนเข้าครั้งแรก
  const hash = await bcrypt.hash('pxe-setup-2027', 10)
  const roles = (await q('select code from role order by sort')).rows.map(r => r.code)
  for (const r of roles) {
    await q(`insert into app_user (email, name, role, password_hash, must_change_password)
             values ($1,$2,$3,$4,true) on conflict (email) do nothing`,
            [`${r}@penguinx.local`, r, r, hash])
  }
  const admin = await one(`select id from app_user where role='admin' limit 1`)

  // บัญชีของทีมขายจริง หนึ่งคนหนึ่งบัญชี ผูกกับชื่อเซลล์ในระบบ
  // ไม่มีการผูกนี้ บทบาทที่เห็นเฉพาะดีลตัวเองจะเห็นศูนย์ดีล

  // ---- ทีมขาย
  for (const r of D.reps || []) {
    await q(`insert into sales_agent (name, kind, commission_rate, active)
             values ($1,$2,$3,$4) on conflict (name) do update
             set kind=excluded.kind, commission_rate=excluded.commission_rate`,
            [r.name, r.kind === 'agent' ? 'agent' : r.kind === 'house' ? 'house' : 'inhouse',
             r.rate || 0, r.active !== false])
  }
  const agents = Object.fromEntries(
    (await q('select id, name from sales_agent')).rows.map(r => [r.name, r.id]))

  for (const r of D.reps || []) {
    if (r.kind === 'house' || !r.active) continue
    const email = `${String(r.name).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'rep'}@penguinx.local`
    await q(`insert into app_user (email, name, role, password_hash, must_change_password, agent_id)
             values ($1,$2,'sales',$3,true,$4)
             on conflict (email) do update set agent_id = excluded.agent_id, name = excluded.name`,
            [email, r.name, hash, agents[r.name] ?? null])
  }

  let stats = {}
  for (const e of D.events) {
    stats[e.id] = await writeEvent(q, e, { agents, adminId: admin.id })
  }

  await q('commit')
  console.table(stats)
  await pool.end()
}
main().catch(async (e) => { await q('rollback').catch(() => {}); console.error(e); process.exit(1) })

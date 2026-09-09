/* นำเข้าผู้ติดต่อและผูกเจ้าของดีลจากไฟล์ต้นทาง สำหรับงานที่นำเข้าไปก่อนหน้านี้ */
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (t, p) => pool.query(t, p)
const D = JSON.parse(fs.readFileSync('prototypes/app4.json', 'utf8'))
const users = {}
for (const u of (await q(`select id, name from app_user where active`)).rows) {
  users[String(u.name).trim().toLowerCase()] = u.id
}
let added = 0, owned = 0
for (const ev of D.events) {
  const e = (await q(`select id from event where code=$1`, [ev.id])).rows[0]
  if (!e) continue
  // ผู้ติดต่อ จากข้อมูลที่ติดอยู่กับบูธ
  for (const b of ev.booths || []) {
    if (!b.co || (!b.contact && !b.phone && !b.email)) continue
    const c = (await q(
      `select c.id from company c join deal d on d.company_id=c.id
        where c.name=$1 and d.event_id=$2 limit 1`, [b.co, e.id])).rows[0]
    if (!c) continue
    const has = await q(`select 1 from contact_person where company_id=$1`, [c.id])
    if (has.rowCount) continue
    await q(`insert into contact_person (company_id,name,phone,email,is_primary)
             values ($1,$2,$3,$4,true)`,
      [c.id, b.contact || b.co, b.phone || null, b.email || null])
    added++
  }
  // เจ้าของดีล จากชื่อเซลล์
  for (const d of ev.deals || []) {
    const uid = users[String(d.sales ?? '').trim().toLowerCase()]
    if (!uid) continue
    const r = await q(
      `update deal d set owner_id=$1 from company c
        where c.id=d.company_id and c.name=$2 and d.event_id=$3 and d.owner_id is null`,
      [uid, d.co, e.id])
    owned += r.rowCount
  }
}
const n = await q(`select (select count(*) from contact_person) c,
  (select count(*) from deal where owner_id is not null) o, (select count(*) from deal) t`)
console.log(`เพิ่มผู้ติดต่อ ${added} ราย | ผูกเจ้าของดีล ${owned} ใบ`)
console.log(`ตอนนี้: ผู้ติดต่อ ${n.rows[0].c} | ดีลที่มีเจ้าของ ${n.rows[0].o} จาก ${n.rows[0].t}`)
process.exit(0)

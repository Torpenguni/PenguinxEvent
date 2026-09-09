/* กู้คนบนเวทีและการผูกกับช่วงเวทีกลับจากไฟล์ต้นทาง จับคู่ช่วงเวทีด้วยเวที+วัน+เวลา */
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (t, p) => pool.query(t, p)
const D = JSON.parse(fs.readFileSync('prototypes/app4.json', 'utf8'))

let added = 0, links = 0
for (const ev of D.events) {
  const e = (await q(`select id from event where code=$1`, [ev.id])).rows[0]
  if (!e) continue
  const rows = (await q(
    `select s.id, st.name as stage, s.day_no, to_char(s.starts_at,'HH24:MI') as t1
       from session s join stage st on st.id=s.stage_id where s.event_id=$1`, [e.id])).rows
  const key = (st, d, t1) => `${st}|${d}|${t1}`
  const map = new Map(rows.map((r) => [key(r.stage, r.day_no, r.t1), r.id]))

  for (const s of ev.sessions || []) {
    const t1 = String(s.time || '').split('-')[0]
    const sid = map.get(key(s.stage, s.day || 1, t1))
    if (!sid) continue
    for (const [i, p] of (s.people || []).entries()) {
      const name = (p.real || p.n || '').trim()
      if (!name) continue
      let pid = (await q(`select id from person where coalesce(name_th,nickname)=$1 limit 1`, [name])).rows[0]?.id
      if (!pid) {
        pid = (await q(`insert into person (nickname,name_th,title,phone,note)
                        values ($1,$2,$3,$4,$5) returning id`,
          [p.n || null, p.real || null, p.pos || null, p.contact || null, p.coord || null])).rows[0].id
        added++
      }
      await q(`insert into session_person (session_id, person_id, role, status, sort)
               values ($1,$2,'speaker',$3,$4) on conflict do nothing`,
        [sid, pid, /confirm/i.test(p.st || '') ? 'confirmed' : 'invited', i])
      links++
    }
  }
}
const n = await q(`select (select count(*) from person) p, (select count(*) from session_person) sp`)
console.log(`กู้คืนแล้ว: เพิ่มคน ${added} | ผูกกับช่วงเวที ${links} ครั้ง`)
console.log('ตอนนี้ในฐานข้อมูล: คน', n.rows[0].p, '| การผูก', n.rows[0].sp)
process.exit(0)

/* กู้บล็อกบนผังที่ไม่ใช่บูธกลับจากไฟล์ต้นทาง เวที ทางเดิน กองอำนวยการ */
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const D = JSON.parse(fs.readFileSync('prototypes/app4.json', 'utf8'))
for (const ev of D.events) {
  const areas = ev.areas || []
  if (!areas.length) continue
  const { rowCount } = await pool.query(
    `update event_setting s set settings = jsonb_set(s.settings, '{areas}', $2::jsonb)
       from event e where e.id = s.event_id and e.code = $1`,
    [ev.id, JSON.stringify(areas)])
  console.log(ev.id, '→ กู้บล็อกบนผัง', areas.length, 'ชิ้น', rowCount ? '✓' : '(ไม่พบงาน)')
}
process.exit(0)

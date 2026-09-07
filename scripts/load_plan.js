#!/usr/bin/env node
// นำผังที่สกัดจากชีตเข้าฐานข้อมูล
//   python3 scripts/sheet_to_plan.py booking.md > plan.json
//   node scripts/load_plan.js restech-trc-2026 plan.json
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const [code, file] = process.argv.slice(2)
if (!code || !file) {
  console.error('ใช้: node scripts/load_plan.js <event code> <plan.json>')
  process.exit(1)
}

const plan = JSON.parse(readFileSync(file, 'utf8'))
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})
const client = await pool.connect()

try {
  await client.query('begin')
  const ev = await client.query(`select id from event where code = $1`, [code])
  if (!ev.rowCount) throw new Error(`ไม่พบงานรหัส ${code}`)
  const eventId = ev.rows[0].id

  // โซนสร้างจากอักษรนำของรหัสบูธ
  const zones = [...new Set(plan.booths.map((b) => b.zone))]
  for (const z of zones) {
    await client.query(
      `insert into zone (event_id, code, name) values ($1, $2, $2)
       on conflict (event_id, code) do nothing`,
      [eventId, z],
    )
  }

  let n = 0
  for (const b of plan.booths) {
    const type = b.sqm >= 9 ? 'std3x3' : 'food2x2'
    await client.query(
      `insert into booth (event_id, zone_id, booth_type_id, code, label,
                          grid_x, grid_y, grid_w, grid_h, status)
       select $1,
              (select id from zone where event_id = $1 and code = $2),
              (select id from booth_type where event_id = $1 and code = $3),
              $4, $5, $6, $7, $8, $9, 'available'
       on conflict (event_id, code) do update
          set grid_x = excluded.grid_x, grid_y = excluded.grid_y,
              grid_w = excluded.grid_w, grid_h = excluded.grid_h,
              label  = excluded.label`,
      [eventId, b.zone, type, b.code, b.name ?? null, b.x, b.y, b.w, b.h],
    )
    n++
  }

  await client.query('commit')
  console.log(`นำเข้า ${n} บูธ ${zones.length} โซน เข้างาน ${code} แล้ว`)
  console.log('สถานะทุกบูธตั้งเป็น available ต้องให้ทีมยืนยันสถานะจริงก่อนใช้')
} catch (e) {
  await client.query('rollback')
  console.error('ล้มเหลว:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

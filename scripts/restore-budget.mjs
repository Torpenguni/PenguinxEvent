/* กู้บรรทัดงบของ restech กลับจากไฟล์ต้นทาง แตะเฉพาะสองตารางนี้ ไม่ยุ่งกับของอื่น */
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const q = (t, p) => pool.query(t, p)
const D = JSON.parse(fs.readFileSync('prototypes/app4.json', 'utf8'))
const ev = D.events.find((e) => e.id === 'restech')
const { rows } = await q(`select id from event where code='restech'`)
const eid = rows[0].id
const have = await q(`select count(*)::int n from budget_line where event_id=$1`, [eid])
console.log('งบในฐานข้อมูลตอนนี้:', have.rows[0].n, 'บรรทัด | ในไฟล์ต้นทาง:', ev.budget.length)
if (have.rows[0].n > 0) { console.log('มีข้อมูลอยู่แล้ว ไม่แตะ'); process.exit(0) }

await q('begin')
const cat = {}
for (const l of ev.budget) {
  if (cat[l.cat]) continue
  const c = await q(`insert into budget_category (event_id, side, code, name)
                     values ($1,'expense',$2,$3) returning id`, [eid, l.cat.slice(0, 40), l.cat])
  cat[l.cat] = c.rows[0].id
}
const vals = []
const tup = ev.budget.map((l, i) => {
  const row = [eid, cat[l.cat], (l.sub ? l.sub + ' › ' : '') + l.name, i,
    l.qty || null, l.unit || null, l.qty2 || null, l.unit2 || null, l.price || null,
    l.calc && l.price ? Math.round((l.qty || 1) * (l.qty2 || 1) * l.price) : (l.fc || 0),
    l.ac || 0, ['planned', 'committed', 'paid'].includes(l.st) ? l.st : 'planned', l.sub || null]
  return '(' + row.map((v) => { vals.push(v); return '$' + vals.length }).join(',') + ')'
})
await q(`insert into budget_line (event_id, category_id, name, sort, fc_qty, fc_unit, fc_qty2,
         fc_unit2, fc_unit_cost, fc_total, ac_total, status, note) values ${tup.join(',')}`, vals)
await q('commit')
const after = await q(`select count(*)::int n, sum(fc_total)::bigint s from budget_line where event_id=$1`, [eid])
console.log('กู้คืนแล้ว:', after.rows[0].n, 'บรรทัด | ยอดรวมงบ', Number(after.rows[0].s).toLocaleString('th-TH'), 'บาท')
process.exit(0)

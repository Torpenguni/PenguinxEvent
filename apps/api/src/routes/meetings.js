/* ตารางนัดเจรจาของ hosted buyer program
   แยก endpoint ออกจากการบันทึกทั้งงานด้วยเหตุผลเดียวกับทะเบียนผู้ซื้อ
   การบันทึกทั้งงานลบทุกอย่างแล้วเขียนใหม่ ซึ่งใช้กับตารางนัดไม่ได้เลย
   นัดถูกจัดครั้งเดียวแล้วมีคนถือตารางนั้นเดินอยู่ในงาน ข้อมูลจะหายเพราะมีคนขยับบูธไม่ได้ */
import { Router } from 'express'
import { q } from '../db.js'
import { require as need, audit } from '../auth.js'

const r = Router()

const txt = (v) => { const t = String(v ?? '').trim(); return t || null }
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null }
const pos = (v, d) => { const n = num(v); return n != null && n >= 0 ? n : d }
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0 }
const listTxt = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
/* เวลารับได้ทั้ง 9:00 และ 09:00 เพราะทีมคีย์จากตารางที่พิมพ์กันเองมา
   ค่าที่ไม่ใช่เวลาเลยต้องคืน null ไม่ใช่เดาให้ ไม่งั้นตารางจะมีนัดตอนตีสามโดยไม่มีใครรู้ */
const time = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim())
  if (!m) return null
  const h = +m[1], mi = +m[2]
  if (h > 23 || mi > 59) return null
  return String(h).padStart(2, '0') + ':' + m[2]
}
const date = (v) => {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

async function eventOf (code) {
  return (await q(`select id, code from event where code = $1`, [code])).rows[0]
}

/* ต่อสายกลับก่อนอ่านทุกครั้ง แถว event ถูกสร้างใหม่ทุกครั้งที่บันทึกทั้งงาน
   event_id ของทุกตารางในโมดูลนี้จึงกลายเป็นค่าว่าง ทั้งที่ข้อมูลยังอยู่ครบ
   ทะเบียนผู้ซื้อเจอปัญหานี้มาก่อนแล้ว วิธีแก้เหมือนกันคือผูกกลับด้วย code */
const TABLES = ['meeting_slot', 'meeting_place', 'match_pref', 'meeting', 'perk_rule', 'buyer_perk']
async function relink (ev) {
  for (const t of TABLES) {
    await q(`update ${t} set event_id = $2 where code = $1 and event_id is distinct from $2`,
      [ev.code, ev.id])
  }
}

/* คอลัมน์ date ถูกไดรเวอร์แปลงเป็น Date ตามเขตเวลาเครื่อง ส่งออกดิบ ๆ จะกลายเป็น
   2027-08-19T17:00Z ทั้งที่เก็บไว้เป็นวันที่ 20 หน้าเว็บส่งค่านั้นกลับมาแล้วตัวตรวจไม่ผ่าน
   วันที่จึงหายไปทั้งคอลัมน์ และช่วงเวลาเดิมจะถูกสร้างซ้ำเป็นแถวใหม่เพราะคีย์ไม่ตรงกัน
   อ่านด้วย getter ตามเวลาท้องถิ่นเหมือนที่ writeEvent ทำกับวันจัดงาน */
const ymd = (v) => {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const p2 = (n) => String(n).padStart(2, '0')
  return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate())
}
const slotOut = (x) => ({
  id: String(x.id), onDate: ymd(x.on_date), dayNo: x.day_no,
  startsAt: String(x.starts_at).slice(0, 5), minutes: x.minutes, kind: x.kind, sort: x.sort,
})
const placeOut = (x) => ({
  id: String(x.id), placeCode: x.place_code, kind: x.kind, boothCode: x.booth_code,
  zone: x.zone, company: x.company, seats: x.seats, active: x.active, note: x.note, sort: x.sort,
})
const prefOut = (x) => ({
  id: String(x.id), side: x.side, buyerId: String(x.buyer_id), company: x.company,
  weight: x.weight, note: x.note, createdAt: x.created_at,
})
const meetOut = (x) => ({
  id: String(x.id), buyerId: String(x.buyer_id), company: x.company,
  slotId: x.slot_id == null ? null : String(x.slot_id),
  placeId: x.place_id == null ? null : String(x.place_id),
  status: x.status, pinned: x.pinned, score: x.score, reason: x.reason,
  outcome: x.outcome, checkedInAt: x.checked_in_at,
})
const ruleOut = (x) => ({
  id: String(x.id), name: x.name, kind: x.kind, minMeetings: x.min_meetings,
  minAttended: x.min_attended, provinceMode: x.province_mode, provinces: x.provinces ?? [],
  qty: x.qty, unit: x.unit, unitCost: Number(x.unit_cost), quota: x.quota,
  budgetCat: x.budget_cat, active: x.active, sort: x.sort, note: x.note,
})
const perkOut = (x) => ({
  id: String(x.id), buyerId: String(x.buyer_id),
  ruleId: x.rule_id == null ? null : String(x.rule_id), ruleName: x.rule_name,
  qty: x.qty, unitCost: Number(x.unit_cost), voucher: x.voucher, state: x.state,
  reason: x.reason, issuedAt: x.issued_at, redeemedAt: x.redeemed_at, revokedAt: x.revoked_at,
})

/* ---------- อ่านทั้งโมดูลในคำขอเดียว ----------
   หน้าจอสี่หน้าอ่านข้อมูลชุดเดียวกันหมด แยกยิงทีละหน้าคือสี่รอบไปสิงคโปร์
   ข้อมูลทั้งโมดูลของงานหนึ่งงานอยู่ในหลักพันแถว ส่งทีเดียวถูกกว่าและเขียนหน้าจอง่ายกว่า */
r.get('/:code/match', need('match'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    await relink(ev)
    const one = async (sql) => (await q(sql, [ev.code])).rows
    res.json({
      slots: (await one(`select * from meeting_slot where code = $1
                          order by on_date nulls first, starts_at, sort`)).map(slotOut),
      places: (await one(`select * from meeting_place where code = $1
                           order by kind, sort, place_code`)).map(placeOut),
      prefs: (await one(`select * from match_pref where code = $1 order by id`)).map(prefOut),
      meetings: (await one(`select * from meeting where code = $1 order by id`)).map(meetOut),
      rules: (await one(`select * from perk_rule where code = $1 order by sort, id`)).map(ruleOut),
      perks: (await one(`select * from buyer_perk where code = $1 order by id`)).map(perkOut),
    })
  } catch (e) { next(e) }
})

/* ---------- ช่วงเวลาและที่นัด ----------
   ทั้งชุดถูกส่งมาทีเดียวเพราะเป็นตารางเล็กที่คนแก้ทีละหลายแถวพร้อมกัน
   แต่ห้าม delete แล้ว insert ใหม่ทั้งชุด แถวที่ไม่ได้แก้จะได้ id ใหม่
   แล้วนัดที่ชี้อยู่จะหลุดจากช่วงเวลาและที่นัดทันที ทั้งที่ผู้ใช้แค่เพิ่มอีกหนึ่งแถว
   จึงเขียนทับตามคีย์ธรรมชาติ แล้วลบเฉพาะแถวที่หายไปจากชุดใหม่จริง ๆ */
r.put('/:code/match/slots', need('match', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const rows = Array.isArray(req.body?.slots) ? req.body.slots : []
    const keep = []
    for (const [i, s] of rows.entries()) {
      const st = time(s.startsAt ?? s.starts_at)
      if (!st) continue
      const on = date(s.onDate ?? s.on_date)
      const row = (await q(
        `insert into meeting_slot (event_id, code, on_date, day_no, starts_at, minutes, kind, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (code, on_date, starts_at) do update
            set day_no = excluded.day_no, minutes = excluded.minutes,
                kind = excluded.kind, sort = excluded.sort
         returning id`,
        [ev.id, ev.code, on, num(s.dayNo ?? s.day_no), st, pos(s.minutes, 30),
          s.kind === 'break' ? 'break' : 'meeting', pos(s.sort, i)])).rows[0]
      keep.push(row.id)
    }
    await q(`delete from meeting_slot where code = $1 and not (id = any($2))`,
      [ev.code, keep.length ? keep : [-1]])
    await audit(req, 'meeting_slot', ev.id, 'update', 'slots', null, String(keep.length))
    const out = (await q(`select * from meeting_slot where code = $1
                           order by on_date nulls first, starts_at, sort`, [ev.code])).rows
    res.json(out.map(slotOut))
  } catch (e) { next(e) }
})

r.put('/:code/match/places', need('match', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const rows = Array.isArray(req.body?.places) ? req.body.places : []
    const keep = []
    for (const [i, p] of rows.entries()) {
      const pc = txt(p.placeCode ?? p.place_code)
      if (!pc) continue
      const kind = p.kind === 'booth' ? 'booth' : 'table'
      const row = (await q(
        `insert into meeting_place
           (event_id, code, place_code, kind, booth_code, zone, company, seats, active, note, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (code, place_code) do update
            set kind = excluded.kind, booth_code = excluded.booth_code, zone = excluded.zone,
                company = excluded.company, seats = excluded.seats, active = excluded.active,
                note = excluded.note, sort = excluded.sort
         returning id`,
        [ev.id, ev.code, pc, kind, kind === 'booth' ? txt(p.boothCode ?? p.booth_code ?? pc) : null,
          txt(p.zone), txt(p.company), pos(p.seats, 2), p.active !== false,
          txt(p.note), pos(p.sort, i)])).rows[0]
      keep.push(row.id)
    }
    await q(`delete from meeting_place where code = $1 and not (id = any($2))`,
      [ev.code, keep.length ? keep : [-1]])
    await audit(req, 'meeting_place', ev.id, 'update', 'places', null, String(keep.length))
    const out = (await q(`select * from meeting_place where code = $1
                           order by kind, sort, place_code`, [ev.code])).rows
    res.json(out.map(placeOut))
  } catch (e) { next(e) }
})

/* ---------- ใครอยากเจอใคร ----------
   เพิ่มทีละแถว เพราะหน้าคีย์ยิงทุกครั้งที่คีย์จบหนึ่งรายการ
   ทีมคีย์ผู้ซื้อสองร้อยคน คนละสิบรายการ ถ้าต้องกดบันทึกทั้งหน้าทุกครั้งจะไม่มีใครใช้ */
r.post('/:code/match/prefs', need('match', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const b = req.body ?? {}
    const company = txt(b.company)
    const buyerId = txt(b.buyerId ?? b.buyer_id)
    if (!company || !buyerId) return res.status(400).json({ error: 'ต้องมีผู้ซื้อและชื่อบริษัท' })
    const weight = ['must', 'nice', 'exclude'].includes(b.weight) ? b.weight : 'nice'
    const side = b.side === 'exhibitor' ? 'exhibitor' : 'buyer'
    /* ชื่อบริษัทเดียวกันอาจมีแถวในตาราง company อยู่แล้ว ผูกไว้ให้ถ้าหาเจอ
       หาไม่เจอก็ไม่เป็นไร ชื่อคือคีย์หลักอยู่แล้ว ไม่ต้องสร้างบริษัทใหม่จากหน้านี้ */
    const co = (await q(`select id from company where lower(name) = lower($1) limit 1`,
      [company])).rows[0]
    const row = (await q(
      `insert into match_pref (event_id, code, side, buyer_id, company_id, company, weight, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (code, side, buyer_id, company) do update
          set weight = excluded.weight, note = excluded.note
       returning *`,
      [ev.id, ev.code, side, buyerId, co?.id ?? null, company, weight,
        txt(b.note), req.user?.id ?? null])).rows[0]
    await audit(req, 'match_pref', row.id, 'create', side, null, company + ' · ' + weight)
    res.status(201).json(prefOut(row))
  } catch (e) { next(e) }
})

r.patch('/match/prefs/:id', need('match', 'write'), async (req, res, next) => {
  try {
    const b = req.body ?? {}
    const cur = (await q(`select * from match_pref where id = $1`, [req.params.id])).rows[0]
    if (!cur) return res.status(404).json({ error: 'ไม่พบรายการนี้' })
    const weight = ['must', 'nice', 'exclude'].includes(b.weight) ? b.weight : cur.weight
    const row = (await q(
      `update match_pref set weight = $2, note = $3 where id = $1 returning *`,
      [req.params.id, weight, b.note === undefined ? cur.note : txt(b.note)])).rows[0]
    await audit(req, 'match_pref', row.id, 'update', 'weight', cur.weight, weight)
    res.json(prefOut(row))
  } catch (e) { next(e) }
})

r.delete('/match/prefs/:id', need('match', 'write'), async (req, res, next) => {
  try {
    const row = (await q(`delete from match_pref where id = $1 returning company`,
      [req.params.id])).rows[0]
    if (!row) return res.status(404).json({ error: 'ไม่พบรายการนี้' })
    await audit(req, 'match_pref', req.params.id, 'delete', null, row.company, 'ลบแล้ว')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* ---------- นัด ----------
   เฟสนี้สร้างและแก้ทีละนัดด้วยมือ ตัวจับคู่อัตโนมัติอยู่ในขั้นถัดไป
   แต่เส้นทางเขียนไว้ก่อนแล้ว ตัวจับคู่จะได้เรียกเส้นเดียวกันนี้ ไม่ต้องมีสองทางเขียน */
r.post('/:code/match/meetings', need('match', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const b = req.body ?? {}
    const company = txt(b.company)
    const buyerId = txt(b.buyerId ?? b.buyer_id)
    if (!company || !buyerId) return res.status(400).json({ error: 'ต้องมีผู้ซื้อและชื่อบริษัท' })
    const co = (await q(`select id from company where lower(name) = lower($1) limit 1`,
      [company])).rows[0]
    const row = (await q(
      `insert into meeting (event_id, code, buyer_id, company_id, company, slot_id, place_id,
                            status, pinned, score, reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [ev.id, ev.code, buyerId, co?.id ?? null, company,
        txt(b.slotId ?? b.slot_id), txt(b.placeId ?? b.place_id),
        txt(b.status) ?? 'draft', b.pinned === true, num(b.score), txt(b.reason)])).rows[0]
    await audit(req, 'meeting', row.id, 'create', null, null, company)
    res.status(201).json(meetOut(row))
  } catch (e) { next(e) }
})

const MEET_SET = {
  slotId: 'slot_id', placeId: 'place_id', status: 'status', pinned: 'pinned',
  score: 'score', reason: 'reason', outcome: 'outcome',
}
r.patch('/match/meetings/:id', need('match', 'write'), async (req, res, next) => {
  try {
    const cur = (await q(`select * from meeting where id = $1`, [req.params.id])).rows[0]
    if (!cur) return res.status(404).json({ error: 'ไม่พบนัดนี้' })
    const set = [], vals = [req.params.id]
    for (const [k, col] of Object.entries(MEET_SET)) {
      if (req.body?.[k] === undefined) continue
      let v = req.body[k]
      if (col === 'pinned') v = v === true
      else if (col === 'score') v = num(v)
      else v = txt(v)
      vals.push(v); set.push(`${col} = $${vals.length}`)
    }
    /* เช็กอินคือการประทับเวลา ไม่ใช่แค่เปลี่ยนสถานะ
       สถานะบอกว่าผลเป็นอย่างไร เวลาบอกว่าเกิดขึ้นตอนไหน รายงานหลังงานต้องการทั้งสองอย่าง */
    if (req.body?.status === 'attended') set.push(`checked_in_at = coalesce(checked_in_at, now())`)
    if (!set.length) return res.json(meetOut(cur))
    const row = (await q(
      `update meeting set ${set.join(', ')}, updated_at = now() where id = $1 returning *`,
      vals)).rows[0]
    await audit(req, 'meeting', row.id, 'update',
      Object.keys(req.body ?? {}).join(','), cur.status, row.status)
    res.json(meetOut(row))
  } catch (e) { next(e) }
})

r.delete('/match/meetings/:id', need('match', 'write'), async (req, res, next) => {
  try {
    const row = (await q(`delete from meeting where id = $1 returning company`,
      [req.params.id])).rows[0]
    if (!row) return res.status(404).json({ error: 'ไม่พบนัดนี้' })
    await audit(req, 'meeting', req.params.id, 'delete', null, row.company, 'ลบแล้ว')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/* ---------- กฎสิทธิประโยชน์ ----------
   ทีมแก้เกณฑ์เองได้ทั้งหมด ไม่มีเกณฑ์ไหนฝังอยู่ในโค้ด
   เขียนทับตามชื่อกฎ เปลี่ยนชื่อคือกฎใหม่ ซึ่งถูกแล้ว เพราะสิทธิ์ที่ออกไปแล้วเก็บชื่อไว้ในตัวมันเอง */
r.put('/:code/match/rules', need('match', 'write'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const rows = Array.isArray(req.body?.rules) ? req.body.rules : []
    const keep = []
    for (const [i, x] of rows.entries()) {
      const name = txt(x.name)
      if (!name) continue
      const mode = ['any', 'in', 'not_in'].includes(x.provinceMode ?? x.province_mode)
        ? (x.provinceMode ?? x.province_mode) : 'any'
      const row = (await q(
        `insert into perk_rule (event_id, code, name, kind, min_meetings, min_attended,
                                province_mode, provinces, qty, unit, unit_cost, quota,
                                budget_cat, active, sort, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (code, name) do update
            set kind = excluded.kind, min_meetings = excluded.min_meetings,
                min_attended = excluded.min_attended, province_mode = excluded.province_mode,
                provinces = excluded.provinces, qty = excluded.qty, unit = excluded.unit,
                unit_cost = excluded.unit_cost, quota = excluded.quota,
                budget_cat = excluded.budget_cat, active = excluded.active,
                sort = excluded.sort, note = excluded.note
         returning id`,
        [ev.id, ev.code, name,
          ['meal', 'hotel', 'transport', 'ticket', 'other'].includes(x.kind) ? x.kind : 'other',
          pos(x.minMeetings ?? x.min_meetings, 0), num(x.minAttended ?? x.min_attended),
          mode, mode === 'any' ? [] : listTxt(x.provinces),
          pos(x.qty, 1), txt(x.unit), money(x.unitCost ?? x.unit_cost),
          num(x.quota), txt(x.budgetCat ?? x.budget_cat),
          x.active !== false, pos(x.sort, i), txt(x.note)])).rows[0]
      keep.push(row.id)
    }
    await q(`delete from perk_rule where code = $1 and not (id = any($2))`,
      [ev.code, keep.length ? keep : [-1]])
    await audit(req, 'perk_rule', ev.id, 'update', 'rules', null, String(keep.length))
    const out = (await q(`select * from perk_rule where code = $1 order by sort, id`,
      [ev.code])).rows
    res.json(out.map(ruleOut))
  } catch (e) { next(e) }
})

/* ใครเข้าเกณฑ์บ้าง คำนวณสด ไม่เขียนอะไรลงฐานข้อมูล
   เกณฑ์ยังต้องปรับอีกหลายรอบ ทีมต้องกดดูผลก่อนได้ว่าถ้าตั้งแบบนี้จะออกไปกี่ใบและเป็นเงินเท่าไหร่
   หลักเดียวกับคะแนนคัดกรองผู้ซื้อที่คำนวณสดทุกครั้งแทนที่จะเก็บค่าค้างไว้ */
r.get('/:code/match/perk-preview', need('match'), async (req, res, next) => {
  try {
    const ev = await eventOf(req.params.code)
    if (!ev) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    const rules = (await q(`select * from perk_rule where code = $1 and active order by sort, id`,
      [ev.code])).rows
    const buyers = (await q(`select id, name, province, status from buyer where code = $1`,
      [ev.code])).rows
    /* นับสองแบบ นัดที่ยืนยันแล้วใช้ตอนออกสิทธิ์ก่อนงาน นัดที่เช็กอินจริงใช้ตอนตัดสิทธิ์หลังงาน */
    const counts = {}
    for (const m of (await q(
      `select buyer_id, status from meeting where code = $1 and status <> 'cancelled'`,
      [ev.code])).rows) {
      const k = String(m.buyer_id)
      counts[k] = counts[k] || { confirmed: 0, attended: 0 }
      if (['confirmed', 'published', 'attended'].includes(m.status)) counts[k].confirmed++
      if (m.status === 'attended') counts[k].attended++
    }
    const inList = (p, list) => list.some((x) => String(p ?? '').includes(x))
    const out = rules.map((ru) => {
      const hit = buyers.filter((b) => {
        const c = counts[String(b.id)] || { confirmed: 0, attended: 0 }
        if (c.confirmed < ru.min_meetings) return false
        if (ru.province_mode === 'in' && !inList(b.province, ru.provinces)) return false
        if (ru.province_mode === 'not_in' && inList(b.province, ru.provinces)) return false
        return true
      })
      const over = ru.quota != null && hit.length * ru.qty > ru.quota
      return {
        ruleId: String(ru.id), name: ru.name, qty: ru.qty, unit: ru.unit,
        buyers: hit.length, units: hit.length * ru.qty,
        cost: hit.length * ru.qty * Number(ru.unit_cost),
        overQuota: over,
        /* ส่งรายชื่อกลับไปด้วย ทีมต้องเห็นว่าใครได้ ไม่ใช่เห็นแค่ตัวเลขรวมแล้วต้องมาไล่เอง */
        names: hit.slice(0, 200).map((b) => ({ id: String(b.id), name: b.name, province: b.province })),
      }
    })
    res.json(out)
  } catch (e) { next(e) }
})

export default r

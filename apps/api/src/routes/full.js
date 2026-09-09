import { Router } from 'express'
import { q } from '../db.js'
import { require as need } from '../auth.js'
import { writeEvent } from '../writeEvent.js'

const r = Router()

const ST = { available: 'free', held: 'booked', contracted: 'booked',
             deposit_paid: 'deposit', paid: 'paid', blocked: 'free' }
const TL = { plan: '', doing: 'doing', done: 'done', risk: 'risk' }
const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
// นาทีนับจากเที่ยงคืน 09:30 = 570 ใช้วางตำแหน่งบล็อกในตารางเวที
const mins = (t) => {
  const v = hhmm(t)
  if (!v) return null
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
/* pg คืน date มาเป็น Date ของ JS ถ้าเอา String() ครอบจะได้ 'Mon Mar 01 2027 ...'
   ตัดสิบตัวแรกเลยได้ 'Mon Mar 01' ซึ่งเขียนกลับลงคอลัมน์ date ไม่ได้
   ประกอบเองจากส่วนของเวลาท้องถิ่น ไม่ใช้ toISOString ที่เลื่อนวันตามโซนเวลา */
const ymd = (d) => {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

/* คืนข้อมูลงานทั้งก้อนในรูปเดียวกับที่หน้าเว็บใช้อยู่
   ทำแบบนี้เพื่อไม่ต้องรื้อหน้าเว็บที่ตรวจมาแล้ว 22 หน้า
   ตัวเลขเงินตัดออกตามสิทธิ์ที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนบนหน้าจอ */
/* ดึงงานทั้งก้อนออกมาในรูปที่หน้าเว็บใช้ แยกเป็นฟังก์ชันเพราะตอนบันทึกก็ต้องใช้
   เพื่อเอาค่าเดิมของส่วนที่ผู้ใช้ไม่มีสิทธิ์แก้ มาคงไว้แทนที่ส่งมา */
async function fetchFull (code, perms, user) {

    const ev = (await q(`select * from event where code = $1`, [code])).rows[0]
    if (!ev) return null
    const id = ev.id
    const seeMoney = (perms?.budget?.level ?? 'none') !== 'none'
    // เป้ารายได้แยกสิทธิ์จากงบ เซลล์ต้องเห็นเป้าเพื่อดู run rate แต่ไม่เห็น Feasibility
    const seeTarget = (perms?.target?.level ?? 'none') !== 'none'
    const seePrice = (perms?.price?.level ?? 'none') !== 'none'
    const own = perms?.deal?.scope === 'own'
    const myAgent = user.agent_id ?? null

    const [set, brands, zones, types, benefits, addons, booths, deals, items,
           budget, stages, sessions, people, tasks, etasks, tl, agents] = await Promise.all([
      q(`select settings from event_setting where event_id=$1`, [id]),
      q(`select name from event_brand where event_id=$1 order by id`, [id]),
      q(`select * from zone where event_id=$1 order by sort, id`, [id]),
      q(`select * from booth_type where event_id=$1 order by list_price desc`, [id]),
      q(`select bt.name as pkg, pb.label, pb.kind from package_benefit pb
           join booth_type bt on bt.id=pb.booth_type_id where bt.event_id=$1 order by pb.sort, pb.id`, [id]),
      q(`select * from addon where event_id=$1 order by id`, [id]),
      q(`select b.*, z.code as zone_code, bt.name as pkg from booth b
           left join zone z on z.id=b.zone_id left join booth_type bt on bt.id=b.booth_type_id
          where b.event_id=$1 order by b.id`, [id]),
      q(`select d.*, c.name as company, sa.name as agent, d.agent_id from deal d
           join company c on c.id=d.company_id left join sales_agent sa on sa.id=d.agent_id
          where d.event_id=$1 order by d.id`, [id]),
      q(`select di.deal_id, b.code from deal_item di join booth b on b.id=di.booth_id
          where di.item_type='booth'`, []),
      q(`select bl.*, bc.name as cat from budget_line bl
           join budget_category bc on bc.id=bl.category_id
          where bl.event_id=$1 order by bl.sort`, [id]),
      q(`select * from stage where event_id=$1 order by sort, id`, [id]),
      q(`select s.*, st.name as stage from session s join stage st on st.id=s.stage_id
          where s.event_id=$1 order by s.stage_id, s.day_no, s.starts_at`, [id]),
      q(`select sp.session_id, sp.status, sp.sort, p.* from session_person sp
           join person p on p.id=sp.person_id
           join session s on s.id=sp.session_id where s.event_id=$1 order by sp.sort`, [id]),
      q(`select * from task_template where event_id=$1 order by sort, id`, [id]),
      q(`select et.deal_id, tt.code, et.done from exhibitor_task et
           join task_template tt on tt.id=et.template_id where tt.event_id=$1`, [id]),
      q(`select * from timeline_task where event_id=$1 order by sort, id`, [id]),
      q(`select * from sales_agent order by id`, []),
    ])

    const S = set.rows[0]?.settings ?? {}
    const boothByDeal = {}
    for (const it of items.rows) (boothByDeal[it.deal_id] ??= []).push(it.code)
    const taskByDeal = {}
    for (const t of etasks.rows) ((taskByDeal[t.deal_id] ??= {})[t.code] = t.done)
    const benByPkg = {}
    for (const b of benefits.rows) (benByPkg[b.pkg] ??= []).push([b.kind, b.label])
    const peopleBySession = {}
    for (const p of people.rows) (peopleBySession[p.session_id] ??= []).push(p)

    const out = {
      id: ev.code, name: ev.name, short: S.short ?? ev.name,
      dates: S.dates ?? null, venue: ev.venue, status: ev.status,
      brands: brands.rows.map((b) => b.name),
      /* ส่งวันที่เป็น YYYY-MM-DD ไม่ใช่ ISO เต็มรูปแบบ หน้าเว็บเอาไปต่อท้ายด้วย T00:00:00
         ก่อนแปลงเป็นวันที่ ถ้าส่ง ISO ไปจะได้สตริงประหลาดแล้วกลายเป็น NaN
         ทั้งหน้าไทม์ไลน์ ทั้งหัวตาราง ทั้งช่องกำหนดส่ง */
      eventDate: ymd(ev.start_date), event_date: ymd(ev.start_date), end_date: ymd(ev.end_date),
      target: seeTarget ? Number(ev.revenue_goal ?? 0) : null,
      target_note: seeTarget ? (S.targetNote ?? null) : null,
      /* โลโก้ ตัวเดโมเคยฝังรูปไว้ในไฟล์ตอน build โหมดต่อเซิร์ฟเวอร์จึงไม่มีรูปเลย
         ใช้ไฟล์ที่ผูกไว้กับงานใน event.logo_url แทน หน้าเว็บใส่ใน img ได้เหมือนกัน */
      logo: S.logo ?? ev.logo_url ?? null, manual: S.manual ?? null,
      tlRange: S.tlRange ?? null, tlCols: S.tlCols ?? [],
      /* บล็อกบนผังที่ไม่ใช่บูธ เวที ทางเดิน กองอำนวยการ ห้องน้ำ
         ไม่มีตารางของตัวเองในฐานข้อมูล เก็บรวมใน settings ไปก่อน
         ของเดิมไม่ได้เก็บเลย ผังในโหมดต่อเซิร์ฟเวอร์จึงว่างไปทั้งชั้น */
      areas: S.areas ?? [],
      buildDays: S.buildDays ?? 1, strikeDays: S.strikeDays ?? 1,
      onH0: S.onH0 ?? 7, onH1: S.onH1 ?? 23,
      zoneNames: Object.fromEntries(zones.rows.map((z) => [z.code, z.name])),
      stages: stages.rows.map((s) => s.name),

      packages: Object.fromEntries(types.rows.map((t) => [t.name, {
        size: `${+t.width_m}x${+t.depth_m} m`,
        build: t.build === 'raw_space' ? 'Raw space' : 'Shell scheme',
        price: seePrice ? Number(t.list_price) : null,
        badge: t.badge_exhibitor, b: benByPkg[t.name] ?? [],
      }])),
      addons: addons.rows.map((a) => [a.name, seePrice ? Number(a.list_price) : null]),

      booths: booths.rows.map((b) => ({
        code: b.code, name: b.label, zone: b.zone_code, x: b.grid_x, y: b.grid_y,
        w: b.grid_w, h: b.grid_h, food: false, st: ST[b.status] ?? 'free',
        co: b.label, sales: null, pkg: b.pkg, product: null,
        contact: null, phone: null, email: null, form: false, board: false,
        list: seePrice ? Number(types.rows.find((t) => t.name === b.pkg)?.list_price ?? 0) : null,
      })),

      deals: deals.rows
        .filter((d) => !own || (myAgent != null && String(d.agent_id) === String(myAgent)))
        .map((d) => ({
          id: d.id, co: d.company, booths: boothByDeal[d.id] ?? [],
          list: seeMoney || seePrice ? Number(d.list_total ?? 0) : null,
          stage: d.status, st: null, sales: d.agent, product: d.key_product,
          form: d.form_received, board: d.on_directory_board,
          holdDays: d.hold_days, holdStart: ymd(d.hold_started_at), holdExp: d.hold_expires_at,
          next: d.next_step ?? null,
          nextDate: ymd(d.next_date),
          acts: [], tasks: taskByDeal[d.id] ?? {},
        })),

      budget: seeMoney ? budget.rows.map((l) => ({
        cat: l.cat, sub: l.note, name: String(l.name).split(' › ').pop(),
        qty: l.fc_qty && Number(l.fc_qty), unit: l.fc_unit,
        qty2: l.fc_qty2 && Number(l.fc_qty2), unit2: l.fc_unit2,
        price: l.fc_unit_cost && Number(l.fc_unit_cost),
        // ตั้งธงคำนวณเฉพาะบรรทัดที่ยอดในชีตตรงกับ จำนวน x จำนวน2 x ราคาต่อหน่วย พอดี
        // อีก 31 บรรทัดชีตระบุยอดไว้ต่างจากผลคูณ ต้องคงยอดของชีตไว้
        calc: !!(l.fc_qty && l.fc_unit_cost &&
          Math.round(Number(l.fc_qty) * Number(l.fc_qty2 || 1) * Number(l.fc_unit_cost))
            === Math.round(Number(l.fc_total || 0))),
        fc: Number(l.fc_total ?? 0), ac: Number(l.ac_total ?? 0),
        st: l.status, sup: null, phone: null, _id: l.id,
      })) : [],

      sessions: sessions.rows.map((s) => ({
        stage: s.stage, day: s.day_no, date: ymd(s.on_date),
        time: hhmm(s.starts_at) + (s.ends_at ? '-' + hhmm(s.ends_at) : ''),   // ไม่มีเวลาจบก็ไม่ต้องมีขีดค้างไว้
        /* ตารางเวทีวางบล็อกตามนาทีจากเที่ยงคืน ไม่ได้อ่านจากสตริงเวลา
           ไม่ส่ง a กับ b ไป บล็อกทุกอันจะไปกองอยู่ที่เดียวกันบนหัวตาราง */
        a: mins(s.starts_at), b: mins(s.ends_at),
        min: s.minutes, title: s.title, kind: s.kind,
        cf: s.title_confirmed, lock: s.time_locked, mod: s.remark,
        script: s.script_url, _id: s.id,
        people: (peopleBySession[s.id] ?? []).map((p) => ({
          n: p.nickname, real: p.name_th, pos: p.title,
          st: p.status === 'confirmed' ? 'Confirm' : 'Invited',
          contact: p.phone, coord: p.note, slides: null,
        })),
      })),

      tasks: tasks.rows.map((t) => ({
        code: t.code, label: t.label, phase: t.phase,
        days: t.due_offset_days, by: t.assigned_to, req: t.required,
      })),

      timeline: tl.rows.map((t) => ({
        _id: t.id, ph: t.phase, grp: t.grp, name: t.name, by: t.work_by,
        st: TL[t.status] ?? '', note: t.note ?? '', x: t.extra ?? {},
        ...(t.phase === 'on'
          ? { d: t.day_no ?? 0, t1: hhmm(t.plan_t1), t2: hhmm(t.plan_t2),
              at1: hhmm(t.act_t1), at2: hhmm(t.act_t2), a: 0, b: 0 }
          : { a: t.plan_a, b: t.plan_b,
              ...(t.act_a != null ? { aa: t.act_a, ab: t.act_b } : {}) }),
      })),

      sales: agents.rows.map((a) => a.name),
      catTotals: {},
    }
    return { event: out, reps: agents.rows.map((a) => ({
      name: a.name, kind: a.kind === 'inhouse' ? 'inhouse' : a.kind,
      rate: Number(a.commission_rate), active: a.active, th: null })) }
}

r.get('/:code/full', need('floorplan'), async (req, res, next) => {
  try {
    const out = await fetchFull(req.params.code, req.perms, req.user)
    if (!out) return res.status(404).json({ error: 'ไม่พบงานนี้' })
    res.json(out)
  } catch (e) { next(e) }
})

/* บันทึกงานทั้งก้อนกลับลงฐานข้อมูล รับรูปเดียวกับที่ GET คืนออกไป
   หน้าเว็บแก้ข้อมูลในหน่วยความจำอยู่แล้วทั้งหมด จึงส่งทั้งก้อนกลับมาทีเดียว
   ง่ายและตรงกว่าการทำ endpoint แยกทีละตาราง และใช้ตัวเขียนตัวเดียวกับตอนนำเข้าครั้งแรก

   สิทธิ์บังคับที่นี่ ไม่ใช่ที่หน้าจอ ใครไม่มีสิทธิ์แก้อะไร ค่าเดิมในฐานข้อมูลจะถูกใช้แทน
   ที่ส่งมา ต่อให้แก้ HTML หรือยิง API ตรงก็เปลี่ยนไม่ได้ */
r.put('/:code/full', need('floorplan', 'write'), async (req, res, next) => {
  const lvl = (m) => req.perms?.[m]?.level ?? 'none'
  const canWrite = (m) => ['write', 'approve'].includes(lvl(m))
  try {
    const body = req.body?.event ?? req.body
    if (!body || typeof body !== 'object' || body.id !== req.params.code) {
      return res.status(400).json({ error: 'ข้อมูลที่ส่งมาไม่ตรงกับงานนี้' })
    }
    if (req.perms?.deal?.scope === 'own') {
      return res.status(403).json({ error: 'บทบาทนี้เห็นเฉพาะดีลของตัวเอง จึงบันทึกทั้งงานไม่ได้' })
    }

    /* ส่วนไหนไม่มีสิทธิ์เขียน เอาของเดิมในฐานข้อมูลมาใช้แทนที่ส่งมา
       ปฏิบัติการเห็นงบเป็นศูนย์อยู่แล้ว ถ้ายอมให้ส่งกลับตรงๆ งบทั้งงานจะถูกล้างทิ้ง */
    const cur = await fetchFull(req.params.code, {
      budget: { level: 'write' }, target: { level: 'write' }, price: { level: 'write' },
      deal: { level: 'write', scope: 'all' }, stage: { level: 'write' },
      exhibitor: { level: 'write' }, timeline: { level: 'write' },
    }, { agent_id: null })
    /* ยังไม่มีงานนี้ในระบบ แปลว่ากำลังสร้างงานใหม่
       ของเดิมตอบ 404 ทิ้ง หน้าเว็บสร้างงานได้แต่ในหน่วยความจำของเบราว์เซอร์เท่านั้น
       รีเฟรชแล้วหาย และไม่มีใครในทีมเห็นงานนั้นเลย */
    if (!cur) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'สร้างงานใหม่ได้เฉพาะผู้ดูแลระบบ' })
      }
      const agents0 = {}
      for (const a of (await q(`select id, name from sales_agent`)).rows) agents0[a.name] = a.id
      const admin0 = (await q(`select id from app_user where role='admin' order by id limit 1`)).rows[0]
      await q('begin')
      try {
        const stat = await writeEvent(q, body, { agents: agents0, adminId: admin0?.id ?? req.user.id })
        await q('commit')
        return res.status(201).json({ ok: true, created: true, saved: stat, at: new Date().toISOString() })
      } catch (e) { await q('rollback').catch(() => {}); throw e }
    }
    const base = cur.event

    const keep = (cond, keys) => {
      if (cond) return
      for (const k of keys) body[k] = base[k]
    }
    keep(canWrite('budget'), ['budget', 'catTotals'])
    keep(canWrite('target'), ['target', 'target_note'])
    keep(canWrite('price'), ['packages', 'addons'])
    keep(canWrite('deal'), ['deals'])
    keep(canWrite('stage'), ['stages', 'sessions'])
    keep(canWrite('exhibitor'), ['tasks'])
    keep(canWrite('timeline'), ['timeline'])
    keep(canWrite('floorplan'), ['booths', 'areas', 'zoneNames'])

    /* กันของหายทั้งก้อน การบันทึกที่นี่คือลบทั้งงานแล้วเขียนใหม่จากสิ่งที่ส่งมา
       ถ้าฝั่งหน้าเว็บส่งก้อนที่ขาดบางส่วนมา เช่นอ่านข้อมูลไปตอนที่อีกคนกำลังบันทึกอยู่
       ส่วนนั้นจะหายถาวรโดยไม่มีใครรู้ตัว งบ 93 บรรทัดเคยหายไปแบบนี้มาแล้วครั้งหนึ่ง
       กติกาคือของที่มีอยู่ในฐานข้อมูลแล้ว จะถูกลบทิ้งด้วยก้อนที่ว่างเปล่าไม่ได้
       การลบจริงต้องทำผ่านหน้าจอของมันเอง ซึ่งลบทีละรายการ ไม่ใช่ทั้งชุดพร้อมกัน */
    const size = (v) => Array.isArray(v) ? v.length
      : (v && typeof v === 'object' ? Object.keys(v).length : 0)
    const kept = []
    for (const k of ['booths', 'deals', 'budget', 'sessions', 'stages', 'timeline',
      'tasks', 'packages', 'zoneNames']) {
      if (size(base[k]) > 0 && size(body[k]) === 0) { body[k] = base[k]; kept.push(k) }
    }
    /* คนบนเวทีซ่อนอยู่ข้างในช่วงเวทีอีกชั้น ด่านข้างบนจึงมองไม่เห็น
       เคยหายไปทั้ง 88 คนมาแล้วเพราะเหตุนี้ */
    const people = (list) => (list || []).reduce((n, s) => n + (s.people || []).length, 0)
    if (people(base.sessions) > 0 && people(body.sessions) === 0) {
      body.sessions = base.sessions
      kept.push('sessions.people')
    }

    const agents = {}
    for (const a of (await q(`select id, name from sales_agent`)).rows) agents[a.name] = a.id
    const admin = (await q(`select id from app_user where role='admin' order by id limit 1`)).rows[0]

    await q('begin')
    try {
      const stat = await writeEvent(q, body, { agents, adminId: admin?.id ?? req.user.id })
      await q('commit')
      res.json({ ok: true, saved: stat, kept, at: new Date().toISOString() })
    } catch (e) { await q('rollback').catch(() => {}); throw e }
  } catch (e) { next(e) }
})

export default r

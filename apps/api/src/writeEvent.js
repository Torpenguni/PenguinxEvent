/* เขียนงานหนึ่งงานลงฐานข้อมูลทั้งก้อน ล้างของเดิมของงานนั้นก่อนแล้วใส่ใหม่
   ใช้ร่วมกันระหว่างสคริปต์นำเข้าครั้งแรก กับ PUT /api/events/:code/full ที่หน้าเว็บเรียกตอนบันทึก
   แยกออกมาไว้ที่เดียว ไม่งั้นสองทางเขียนคนละแบบแล้วข้อมูลจะเพี้ยนกันเงียบๆ */

export const STATUS = { free: 'available', booked: 'held', deposit: 'deposit_paid', paid: 'paid' }
export const DEAL_STATUS = { lead: 'lead', booking: 'booking', quoted: 'quoted',
  confirmed: 'confirmed', billed: 'billed', paid: 'paid', lost: 'lost' }
export const TL_STATUS = { '': 'plan', plan: 'plan', doing: 'doing', done: 'done', risk: 'risk' }

/* q  = ฟังก์ชันยิง SQL ที่อยู่ใน transaction เดียวกันแล้ว
   e  = ก้อน JSON ของงานหนึ่งงาน รูปเดียวกับที่ GET /full คืนออกไป
   ctx = { agents: {ชื่อเซลล์ -> id}, adminId } */
export async function writeEvent (q, e, ctx) {
  const one = async (t, p) => (await q(t, p)).rows[0]
  /* คอลัมน์ date รับสตริงเต็มรูปแบบ ISO ได้ แต่ตัดเป็นวันที่ตามเขตเวลา UTC
     ค่าที่อ่านออกมาเป็น 2027-08-19T17:00Z คือวันที่ 20 ตามเวลาไทย พอเขียนกลับ
     ดิบ ๆ จะกลายเป็นวันที่ 19 งานทั้งงานจึงถอยหลังหนึ่งวันทุกครั้งที่กดบันทึก
     สะสมไปเรื่อย ๆ โดยไม่มีใครเห็น ตัดให้เหลือ YYYY-MM-DD ตามเวลาท้องถิ่นก่อนเสมอ */
  const day = (v) => {
    if (!v) return null
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
      const d = new Date(v)
      if (isNaN(d)) return null
      const p2 = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
    }
    const p2 = (n) => String(n).padStart(2, '0')
    return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate())
  }
  /* รวบหลายแถวเป็นคำสั่งเดียว ของเดิมยิงทีละแถวรวมกว่าเจ็ดร้อยรอบ
     ฐานข้อมูลอยู่สิงคโปร์ แค่ค่าเดินทางไปกลับก็กินเวลาเกือบนาทีต่อการบันทึกหนึ่งครั้ง
     Postgres คืนแถวจาก returning ตามลำดับที่ใส่เข้าไปในคำสั่งเดียว จึงจับคู่ id กลับได้ */
  const bulk = async (table, cols, rows, returning) => {
    if (!rows.length) return []
    const vals = []
    const tuples = rows.map((r) =>
      '(' + r.map((v) => { vals.push(v); return '$' + vals.length }).join(',') + ')')
    const sql = `insert into ${table} (${cols.join(',')}) values ${tuples.join(',')}` +
      (returning ? ` returning ${returning}` : '')
    return (await q(sql, vals)).rows
  }
  const agents = ctx.agents || {}
  const admin = { id: ctx.adminId }
  /* ชื่อเซลล์ในข้อมูลตรงกับชื่อผู้ใช้ในระบบ ใช้ผูก owner_id ให้เอง
     ของเดิมไม่เคยตั้ง ดีลทั้งหมดจึงไม่มีเจ้าของ สิทธิ์เห็นเฉพาะดีลตัวเองเลยเห็นศูนย์ดีล */
  const users = {}
  for (const u of (await q(`select id, name from app_user where active`, [])).rows) {
    users[String(u.name).trim().toLowerCase()] = u.id
  }
  const ownerOf = (name) => users[String(name ?? '').trim().toLowerCase()] ?? null

    const year = +(String(e.eventDate || e.event_date || '').slice(0, 4)) || new Date().getFullYear()
    /* deal_item ชี้ไปที่ booth แบบ restrict ตั้งใจไว้กันลบบูธที่ยังผูกกับดีลอยู่
       แต่ตอนเขียนทับทั้งงาน cascade จากการลบ event ไม่การันตีลำดับ restrict เลยยิงก่อน
       ตัดลูกทิ้งเองก่อนหนึ่งชั้น แล้วค่อยปล่อยให้ cascade จัดการที่เหลือ */
    await q(`delete from deal_item where deal_id in
               (select d.id from deal d join event ev on ev.id = d.event_id where ev.code = $1)`, [e.id])
    await q(`delete from booth_queue where booth_id in
               (select b.id from booth b join event ev on ev.id = b.event_id where ev.code = $1)`, [e.id])
    /* แถว event ถูกลบแล้วสร้างใหม่ทุกครั้งที่บันทึกทั้งงาน เลขรอบจึงถูกรีเซ็ตกลับเป็นค่าตั้งต้น
       ทำให้ด่านกันเขียนทับกันใช้ไม่ได้ตั้งแต่การบันทึกครั้งที่สองเป็นต้นไป
       อ่านเลขเดิมเก็บไว้ก่อนลบ แล้วใส่กลับตอน insert */
    /* ก้อนที่หน้าเว็บส่งมาไม่ได้บรรจุทุกคอลัมน์ของตาราง event
       hall, move_in_from, move_out_to, created_at, cloned_from ไม่เคยถูกส่งออกไปตั้งแต่ตอนอ่าน
       พอลบแถวแล้วสร้างใหม่จึงกลายเป็นค่าว่างทุกครั้งที่บันทึก แก้ห้องไว้ก็หายรอบถัดไป
       และวันที่สร้างงานถูกรีเซ็ตเป็นเวลาที่กดบันทึกล่าสุด อ่านของเดิมเก็บไว้แล้วใส่กลับ */
    const prev = await one(
      `select rev, hall, move_in_from, move_out_to, created_at, cloned_from, logo_url
         from event where code = $1`, [e.id])
    /* ค่าตั้งหน้าจอเก็บรวมเป็นก้อน jsonb ก้อนเดียว และถูกเขียนทับทั้งก้อนตอนบันทึก
       หน้าเว็บไม่ส่งโลโก้กับไฟล์ผังมาด้วย เพราะเป็นรูปฝังขนาดใหญ่ ส่งทุกครั้งจะช้ามาก
       ของเดิมตีความว่า "ไม่ส่งมา" เท่ากับ "ให้ลบ" โลโก้จึงหายทุกครั้งที่มีคนกดบันทึก
       อ่านของเดิมไว้แล้วเก็บคีย์ที่ไม่ได้ส่งมาไว้ตามเดิม */
    const prevSet = (await one(
      `select settings from event_setting where event_id =
         (select id from event where code = $1)`, [e.id]))?.settings ?? {}
    const keepRev = Number(prev?.rev ?? 1)
    /* ตารางที่ผูกกับงานแต่ writeEvent ไม่ได้เขียนใหม่ ถูกลบตามแถว event ไปด้วยทุกครั้ง
       สิทธิ์เข้าถึงงานรายคน ลิงก์แชร์ และช่องทางการตลาด จึงหายทุกครั้งที่มีคนกดบันทึก
       ให้คนเข้าถึงงานไว้ตอนเช้า พอบ่ายมีคนบันทึกงาน สิทธิ์นั้นก็หายไปโดยไม่มีใครรู้
       จดไว้ก่อนลบ แล้วใส่กลับให้ผูกกับแถวใหม่ */
    /* ขั้นตอนเดิมของแต่ละบริษัทในงานนี้ ใช้เทียบว่ามีดีลไหนเปลี่ยนขั้นในการบันทึกรอบนี้บ้าง
       ต้องอ่านก่อนลบ เพราะแถวดีลกำลังจะถูกเขียนใหม่ทั้งชุด */
    const wasStage = {}
    for (const r of (await q(
      `select d.company_id, d.status from deal d join event e on e.id = d.event_id
        where e.code = $1`, [e.id])).rows) wasStage[r.company_id] = r.status

    const carry = {}
    for (const t of ['user_event', 'event_share', 'marketing_channel']) {
      carry[t] = (await q(
        `select * from ${t} where event_id = (select id from event where code = $1)`,
        [e.id])).rows
    }
    await q(`delete from event where code = $1`, [e.id])
    /* logo_url ต้องเขียนกลับด้วย ของเดิมไม่มีในคำสั่ง insert ทุกครั้งที่บันทึกทั้งงาน
       โลโก้จึงหายไปเงียบ ๆ ค่าที่หน้าเว็บส่งมาเป็น path ของไฟล์ เช่น /logos/restech.png
       ถ้าส่งรูปฝังมาเป็น data URI ให้เก็บใน settings เหมือนเดิม ไม่ยัดลงคอลัมน์นี้ */
    const logoPath = typeof e.logo === 'string' && e.logo.startsWith('/') ? e.logo : null
    const ev = await one(
      `insert into event (code, name, edition_year, venue, start_date, end_date, status,
         revenue_goal, logo_url, seats, ticket_price, tickets_sold, rev,
         hall, move_in_from, move_out_to, cloned_from, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17, coalesce($18, now())) returning id`,
      [e.id, e.name, year, e.venue || null,
       day(e.eventDate || e.event_date), day(e.end_date),
       e.status === 'selling' ? 'selling' : 'planning', e.target || null,
       logoPath ?? (e.logo === undefined ? (prev?.logo_url ?? null) : (e.logo_url ?? null)),
       e.seats ?? null, e.ticketPrice ?? null, e.ticketsSold ?? null, keepRev,
       e.hall ?? prev?.hall ?? null, prev?.move_in_from ?? null, prev?.move_out_to ?? null,
       prev?.cloned_from ?? null, prev?.created_at ?? null])

    /* ประวัติการเปลี่ยนขั้นชี้ไปที่แถว event เดิมซึ่งเพิ่งถูกลบ FK เป็น set null
       ทุกแถวจึงกลายเป็นกำพร้าทันทีที่มีคนกดบันทึก และ "ค้างมากี่วัน" หายไปทั้งงาน
       ต่อสายกลับด้วยรหัสงาน ซึ่งเป็นค่าที่ไม่เปลี่ยนตามการเขียนใหม่ */
    await q(`update deal_stage_log set event_id = $2
              where code = $1 and event_id is distinct from $2`, [e.id, ev.id])

    /* ใส่ของที่จดไว้กลับเข้าไป ชี้ไปที่แถวใหม่ ยกคอลัมน์ id เดิมทิ้งให้ฐานข้อมูลแจกใหม่ */
    for (const [t, rows] of Object.entries(carry)) {
      if (!rows.length) continue
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id')
      await bulk(t, cols, rows.map((row) => cols.map(
        (c) => (c === 'event_id' ? ev.id : row[c]))))
    }

    await bulk('event_brand', ['event_id', 'code', 'name'],
      (e.brands || []).map((b) => [ev.id, b, b]))

    // ---- โซน
    const zone = {}
    const zoneRows = Object.entries(e.zoneNames || {})
    ;(await bulk('zone', ['event_id', 'code', 'name'],
      zoneRows.map(([code, name]) => [ev.id, code, name]), 'id, code'))
      .forEach((r) => { zone[r.code] = r.id })

    // ---- ประเภทบูธ / แพ็กเกจ
    const btype = {}
    const pkgs = Object.entries(e.packages || {})
    ;(await bulk('booth_type',
      ['event_id', 'code', 'name', 'tier', 'build', 'width_m', 'depth_m',
        'list_price', 'badge_exhibitor', 'badge_contractor'],
      pkgs.map(([name, p]) => {
        const m = String(p.size || '').match(/([\d.]+)\s*x\s*([\d.]+)/i)
        return [ev.id, name, name, /sponsor/i.test(name) ? 'sponsor' : 'standard',
          p.build === 'พื้นที่เปล่า' || /raw/i.test(p.build || '') ? 'raw_space' : 'shell_scheme',
          m ? +m[1] : 3, m ? +m[2] : 3,
          p.price || 0, p.badge || null, p.badge ? Math.ceil(p.badge / 2) : null]
      }), 'id, code')).forEach((r) => { btype[r.code] = r.id })

    const benefits = []
    for (const [name, p] of pkgs)
      for (const [kind, label] of p.b || [])
        benefits.push([btype[name], label,
          ['included', 'optional', 'limit'].includes(kind) ? kind : 'included'])
    await bulk('package_benefit', ['booth_type_id', 'label', 'kind'], benefits)

    await bulk('addon', ['event_id', 'code', 'name', 'list_price'],
      (e.addons || []).map(([name, price]) => [ev.id, name.slice(0, 40), name, price || 0]))

    // ---- บริษัท + ดีล
    const company = {}
    const dealId = {}
    const names = [...new Set((e.deals || []).map((d) => d.co))]
    /* บริษัทไม่ได้ผูกกับงาน ลบงานทิ้งแล้วแถวบริษัทยังอยู่ ของเดิมใส่ใหม่ทุกครั้งที่บันทึก
       ตารางบริษัทจึงโตเป็นเท่าตัวทุกครั้ง จาก 441 เป็น 882 ใช้ของเดิมถ้าชื่อตรงกัน */
    for (const row of (await q(`select id, name from company where name = any($1)`, [names])).rows) {
      company[row.name] = row.id
    }
    const fresh = names.filter((n) => !company[n])
    ;(await bulk('company', ['name'], fresh.map((n) => [n]), 'id'))
      .forEach((r, i) => { company[fresh[i]] = r.id })

    /* ข้อมูลออกใบกำกับภาษีอยู่ที่บริษัท ไม่ใช่ที่ดีล แต่หน้าเว็บกรอกจากแผงของดีล
       เขียนทีละช่องด้วย coalesce ช่องที่ไม่ได้กรอกจะคงค่าเดิมไว้ ไม่ถูกล้างเป็นค่าว่าง
       เลขผู้เสียภาษีตัดอักขระที่ไม่ใช่ตัวเลขออก เพราะคนกรอกมักใส่ขีดคั่น */
    const digits = (v) => { const t = String(v ?? '').replace(/\D/g, ''); return t || null }
    const txt = (v) => { const t = String(v ?? '').trim(); return t || null }
    for (const d of (e.deals || [])) {
      const b = d.bill
      if (!b || !company[d.co]) continue
      await q(
        `update company set
           name_th      = coalesce($2, name_th),
           tax_id       = coalesce($3, tax_id),
           entity_type  = coalesce($4, entity_type),
           branch_code  = coalesce($5, branch_code),
           address      = coalesce($6, address),
           sub_district = coalesce($7, sub_district),
           district     = coalesce($8, district),
           province     = coalesce($9, province),
           post_code    = coalesce($10, post_code),
           bill_email   = coalesce($11, bill_email),
           website      = coalesce($12, website)
         where id = $1`,
        [company[d.co], txt(b.nameTh), digits(b.taxNumber),
         b.type ? Number(b.type) : null, digits(b.branchCode),
         txt(b.address), txt(b.subDistrict), txt(b.district), txt(b.province),
         digits(b.postCode), txt(b.email), txt(b.website)])
    }

    const deals = e.deals || []
    ;(await bulk('deal',
      ['event_id', 'company_id', 'agent_id', 'owner_id', 'kind', 'status', 'list_total', 'deal_total',
        'hold_days', 'hold_started_at', 'hold_expires_at', 'key_product', 'form_received',
        'on_directory_board', 'next_step', 'next_date', 'created_by'],
      deals.map((d) => [ev.id, company[d.co], agents[d.sales] || null, ownerOf(d.sales), 'booth',
        DEAL_STATUS[d.stage] || 'lead', d.list || 0, d.list || 0,
        d.holdDays || null, day(d.holdStart), d.holdExp || null,
        d.product || null, !!d.form, !!d.board, d.next || null, d.nextDate || null, admin.id]),
      'id')).forEach((r, i) => { dealId[deals[i].id] = r.id })

    const acts = []
    for (const d of deals)
      for (const a of d.acts || [])
        acts.push(['deal', dealId[d.id], admin.id, `[${a.kind}] ${a.note || ''}`, a.date])
    /* จดเฉพาะรายที่ขั้นตอนเปลี่ยนจริง ไม่ใช่ทุกครั้งที่กดบันทึก
       ไม่งั้นตารางจะโตวันละหลายพันแถวจากการบันทึกอัตโนมัติ และ "ค้างมากี่วัน" จะเป็นศูนย์ตลอด */
    const logs = []
    for (const d of deals) {
      const cid = company[d.co]
      if (!cid) continue
      const now = d.stage || 'lead'
      if (wasStage[cid] === now) continue
      logs.push([ev.id, cid, e.id, d.co, now])
    }
    if (logs.length) {
      await bulk('deal_stage_log', ['event_id', 'company_id', 'code', 'company', 'stage'], logs)
    }

    await bulk('comment', ['entity', 'entity_id', 'author_id', 'body', 'created_at'], acts)

    // ---- บูธ
    const boothId = {}
    ;(await bulk('booth',
      ['event_id', 'zone_id', 'booth_type_id', 'code', 'label',
        'grid_x', 'grid_y', 'grid_w', 'grid_h', 'status'],
      (e.booths || []).map((b) => [ev.id, zone[b.zone] || null, btype[b.pkg] || null,
        b.code, b.name || null, b.x, b.y, b.w || 1, b.h || 1, STATUS[b.st] || 'available']),
      'id, code')).forEach((r) => { boothId[r.code] = r.id })

    /* ผู้ติดต่อของลูกค้า หน้าเว็บเก็บไว้ที่บูธ ฐานข้อมูลเก็บที่บริษัท
       ของเดิมไม่ได้เขียนส่วนนี้เลย ชื่อและเบอร์ที่ทีมกรอกจึงหายทุกครั้งที่บันทึก */
    const seenCo = new Set()
    const contacts = []
    for (const b of e.booths || []) {
      const cid = company[b.co]
      if (!cid || seenCo.has(cid)) continue
      if (!b.contact && !b.phone && !b.email) continue
      seenCo.add(cid)
      contacts.push([cid, b.contact || b.co, b.phone || null, b.email || null, true])
    }
    if (contacts.length) {
      await q(`delete from contact_person where company_id = any($1)`, [[...seenCo]])
      await bulk('contact_person', ['company_id', 'name', 'phone', 'email', 'is_primary'], contacts)
    }

    // ผูกบูธเข้ากับดีลผ่าน deal_item
    const items = []
    for (const d of e.deals || [])
      for (const code of d.booths || [])
        if (boothId[code] && dealId[d.id]) items.push([dealId[d.id], 'booth', boothId[code], 1, 0])
    await bulk('deal_item', ['deal_id', 'item_type', 'booth_id', 'qty', 'unit_price'], items)

    // ---- งบประมาณ
    const cat = {}
    for (const l of e.budget || []) {
      if (cat[l.cat]) continue
      const c = await one(
        `insert into budget_category (event_id, side, code, name)
         values ($1,'expense',$2,$3) returning id`, [ev.id, l.cat.slice(0, 40), l.cat])
      cat[l.cat] = c.id
    }
    await bulk('budget_line',
      ['event_id', 'category_id', 'name', 'sort', 'fc_qty', 'fc_unit', 'fc_qty2', 'fc_unit2',
        'fc_unit_cost', 'fc_total', 'ac_total', 'status', 'note'],
      (e.budget || []).map((l, i) => [ev.id, cat[l.cat],
        (l.sub ? l.sub + ' › ' : '') + l.name, i,
        l.qty || null, l.unit || null, l.qty2 || null, l.unit2 || null, l.price || null,
        l.calc && l.price ? Math.round((l.qty || 1) * (l.qty2 || 1) * l.price) : (l.fc || 0),
        l.ac || 0, ['planned', 'committed', 'paid'].includes(l.st) ? l.st : 'planned',
        l.sub || null]))

    // ---- เวที
    const stage = {}
    ;(await bulk('stage', ['event_id', 'code', 'name', 'sort'],
      (e.stages || []).map((name, i) => [ev.id, name.slice(0, 40), name, i]), 'id, name'))
      .forEach((r) => { stage[r.name] = r.id })

    const ses = (e.sessions || []).filter((s) => stage[s.stage])
    const sesId = (await bulk('session',
      ['event_id', 'stage_id', 'day_no', 'on_date', 'starts_at', 'ends_at', 'minutes',
        'kind', 'title', 'title_confirmed', 'time_locked', 'script_url', 'remark'],
      ses.map((s) => {
        const t = String(s.time || '').split('-')
        return [ev.id, stage[s.stage], s.day || 1, day(s.date),
          t[0] || null, t[1] || null, +s.min || null,
          ['talk', 'panel', 'break', 'ceremony', 'workshop', 'house', 'inhouse', 'agent']
            .includes(s.kind) ? s.kind : 'talk',
          s.title || null, !!s.cf, !!s.lock, s.script || null, s.mod || null]
      }), 'id')).map((r) => r.id)

    // คนบนเวทีคนเดียวกันขึ้นหลายช่วงได้ เก็บครั้งเดียวแล้วอ้างซ้ำ
    const person = {}
    const pKeys = []
    const pRows = []
    for (const s of ses)
      for (const p of s.people || []) {
        const key = (p.real || p.n || '').trim()
        if (!key || person[key] !== undefined) continue
        person[key] = null
        pKeys.push(key)
        pRows.push([p.n || null, p.real || null, p.pos || null, p.contact || null, p.coord || null])
      }
    // คนบนเวทีก็ไม่ได้ผูกกับงานเหมือนกัน ใช้ของเดิมถ้าชื่อจริงตรงกัน
    for (const row of (await q(
      `select id, coalesce(name_th, nickname) as key from person
        where coalesce(name_th, nickname) = any($1)`, [pKeys])).rows) {
      if (person[row.key] == null) person[row.key] = row.id
    }
    const newKeys = pKeys.filter((k) => person[k] == null)
    const newRows = newKeys.map((k) => pRows[pKeys.indexOf(k)])
    ;(await bulk('person', ['nickname', 'name_th', 'title', 'phone', 'note'], newRows, 'id'))
      .forEach((r, i) => { person[newKeys[i]] = r.id })

    const links = []
    ses.forEach((s, si) => {
      (s.people || []).forEach((p, i) => {
        const key = (p.real || p.n || '').trim()
        if (!key) return
        links.push([sesId[si], person[key],
          'speaker', /confirm/i.test(p.st || '') ? 'confirmed' : 'invited', i])
      })
    })
    await bulk('session_person', ['session_id', 'person_id', 'role', 'status', 'sort'], links)

    // ---- เช็กลิสต์ผู้ออกบูธ
    const tmpl = {}
    ;(await bulk('task_template',
      ['event_id', 'code', 'label', 'phase', 'assigned_to', 'required', 'due_offset_days', 'sort'],
      (e.tasks || []).map((t, i) => [ev.id, t.code, t.label, t.phase || 'asset',
        t.by === 'organiser' ? 'organiser' : 'exhibitor', t.req !== false, t.days || null, i]),
      'id, code')).forEach((r) => { tmpl[r.code] = r.id })
    const etasks = []
    for (const d of e.deals || [])
      for (const [code, done] of Object.entries(d.tasks || {}))
        if (tmpl[code] && dealId[d.id]) etasks.push([dealId[d.id], tmpl[code], !!done])
    await bulk('exhibitor_task', ['deal_id', 'template_id', 'done'], etasks)

    // ---- ไทม์ไลน์
    await bulk('timeline_task',
      ['event_id', 'phase', 'grp', 'name', 'work_by', 'status', 'plan_a', 'plan_b',
        'act_a', 'act_b', 'day_no', 'plan_t1', 'plan_t2', 'act_t1', 'act_t2', 'note', 'extra', 'sort'],
      (e.timeline || []).map((r, i) => [ev.id, r.ph || 'pre', r.grp, r.name, r.by || null,
        TL_STATUS[r.st] ?? 'plan',
        r.ph === 'on' ? null : r.a, r.ph === 'on' ? null : r.b,
        r.ph === 'on' ? null : (r.aa ?? null), r.ph === 'on' ? null : (r.ab ?? null),
        r.ph === 'on' ? (r.d ?? 0) : null,
        r.ph === 'on' ? r.t1 : null, r.ph === 'on' ? r.t2 : null,
        r.ph === 'on' ? (r.at1 || null) : null, r.ph === 'on' ? (r.at2 || null) : null,
        r.note || null, JSON.stringify(r.x || {}), i]))

    // ---- ค่าตั้งหน้าจอที่ยังไม่คุ้มจะแตกเป็นตาราง
    // ขนาดฮอลล์ ว่างได้ ถ้าใส่มาต้องเป็นตัวเลขบวก ไม่งั้นเก็บเป็นว่างไว้ดีกว่าเก็บค่าเพี้ยน
    const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
    const nextSet = { ...prevSet,
      areas: e.areas || [], tlRange: e.tlRange || null, tlCols: e.tlCols || [],
      buildDays: e.buildDays ?? 1, strikeDays: e.strikeDays ?? 1,
      onH0: e.onH0 ?? 7, onH1: e.onH1 ?? 23,
      manual: e.manual || null, targetNote: e.target_note || null,
      dates: e.dates || null, short: e.short || null,
      hallW: num(e.hallW), hallH: num(e.hallH), gridM: num(e.gridM) }
    /* โลโก้เปลี่ยนได้ทางเดียวคือหน้าอัปโหลดของมันเอง การบันทึกทั้งงานห้ามแตะ
       ยกเว้นกรณีที่ส่ง path ของไฟล์มา ซึ่งแปลว่าเลือกโลโก้สำเร็จรูป ไม่ได้อัปโหลดรูปเอง */
    if (logoPath) nextSet.logo = null
    else if (e.logo !== undefined) nextSet.logo = e.logo || null
    await q(`insert into event_setting (event_id, settings) values ($1,$2)
             on conflict (event_id) do update set settings = excluded.settings`,
            [ev.id, JSON.stringify(nextSet)])

  return {
    booth: (e.booths || []).length, deal: (e.deals || []).length,
    budget: (e.budget || []).length, session: (e.sessions || []).length,
    timeline: (e.timeline || []).length,
  }
}

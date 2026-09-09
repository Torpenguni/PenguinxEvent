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
  const agents = ctx.agents || {}
  const admin = { id: ctx.adminId }

    const year = +(String(e.eventDate || e.event_date || '').slice(0, 4)) || new Date().getFullYear()
    /* deal_item ชี้ไปที่ booth แบบ restrict ตั้งใจไว้กันลบบูธที่ยังผูกกับดีลอยู่
       แต่ตอนเขียนทับทั้งงาน cascade จากการลบ event ไม่การันตีลำดับ restrict เลยยิงก่อน
       ตัดลูกทิ้งเองก่อนหนึ่งชั้น แล้วค่อยปล่อยให้ cascade จัดการที่เหลือ */
    await q(`delete from deal_item where deal_id in
               (select d.id from deal d join event ev on ev.id = d.event_id where ev.code = $1)`, [e.id])
    await q(`delete from booth_queue where booth_id in
               (select b.id from booth b join event ev on ev.id = b.event_id where ev.code = $1)`, [e.id])
    await q(`delete from event where code = $1`, [e.id])
    const ev = await one(
      `insert into event (code, name, edition_year, venue, start_date, end_date, status, revenue_goal)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [e.id, e.name, year, e.venue || null,
       e.eventDate || e.event_date || null, e.end_date || null,
       e.status === 'selling' ? 'selling' : 'planning', e.target || null])

    for (const b of e.brands || [])
      await q(`insert into event_brand (event_id, code, name) values ($1,$2,$3)`, [ev.id, b, b])

    // ---- โซน
    const zone = {}
    for (const [code, name] of Object.entries(e.zoneNames || {})) {
      const z = await one(`insert into zone (event_id, code, name) values ($1,$2,$3) returning id`,
                          [ev.id, code, name])
      zone[code] = z.id
    }

    // ---- ประเภทบูธ / แพ็กเกจ
    const btype = {}
    for (const [name, p] of Object.entries(e.packages || {})) {
      const m = String(p.size || '').match(/([\d.]+)\s*x\s*([\d.]+)/i)
      const bt = await one(
        `insert into booth_type (event_id, code, name, tier, build, width_m, depth_m,
           list_price, badge_exhibitor, badge_contractor)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [ev.id, name, name, /sponsor/i.test(name) ? 'sponsor' : 'standard',
         p.build === 'พื้นที่เปล่า' || /raw/i.test(p.build || '') ? 'raw_space' : 'shell_scheme',
         m ? +m[1] : 3, m ? +m[2] : 3,
         p.price || 0, p.badge || null, p.badge ? Math.ceil(p.badge / 2) : null])
      btype[name] = bt.id
      for (const [kind, label] of p.b || [])
        await q(`insert into package_benefit (booth_type_id, label, kind) values ($1,$2,$3)`,
                [bt.id, label, ['included','optional','limit'].includes(kind) ? kind : 'included'])
    }
    for (const [name, price] of e.addons || [])
      await q(`insert into addon (event_id, code, name, list_price) values ($1,$2,$3,$4)`,
              [ev.id, name.slice(0, 40), name, price || 0])

    // ---- บริษัท + ดีล
    const company = {}
    const dealId = {}
    for (const d of e.deals || []) {
      let cid = company[d.co]
      if (!cid) {
        const c = await one(`insert into company (name) values ($1) returning id`, [d.co])
        cid = company[d.co] = c.id
      }
      const dd = await one(
        `insert into deal (event_id, company_id, agent_id, kind, status, list_total, deal_total,
           hold_days, hold_started_at, hold_expires_at, key_product, form_received,
           on_directory_board, next_step, next_date, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [ev.id, cid, agents[d.sales] || null, 'booth', DEAL_STATUS[d.stage] || 'lead',
         d.list || 0, d.list || 0, d.holdDays || null, d.holdStart || null, d.holdExp || null,
         d.product || null, !!d.form, !!d.board,
         d.next || null, d.nextDate || null, admin.id])
      dealId[d.id] = dd.id
      for (const a of d.acts || [])
        await q(`insert into comment (entity, entity_id, author_id, body, created_at)
                 values ('deal',$1,$2,$3,$4)`,
                [dd.id, admin.id, `[${a.kind}] ${a.note || ''}`, a.date])
    }

    // ---- บูธ
    const boothId = {}
    for (const b of e.booths || []) {
      const bb = await one(
        `insert into booth (event_id, zone_id, booth_type_id, code, label,
           grid_x, grid_y, grid_w, grid_h, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [ev.id, zone[b.zone] || null, btype[b.pkg] || null, b.code, b.name || null,
         b.x, b.y, b.w || 1, b.h || 1, STATUS[b.st] || 'available'])
      boothId[b.code] = bb.id
    }
    // ผูกบูธเข้ากับดีลผ่าน deal_item
    for (const d of e.deals || []) {
      for (const code of d.booths || []) {
        if (!boothId[code] || !dealId[d.id]) continue
        await q(`insert into deal_item (deal_id, item_type, booth_id, qty, unit_price)
                 values ($1,'booth',$2,1,$3)`, [dealId[d.id], boothId[code], 0])
      }
    }

    // ---- งบประมาณ
    const cat = {}
    for (const l of e.budget || []) {
      if (cat[l.cat]) continue
      const c = await one(
        `insert into budget_category (event_id, side, code, name)
         values ($1,'expense',$2,$3) returning id`, [ev.id, l.cat.slice(0, 40), l.cat])
      cat[l.cat] = c.id
    }
    let sort = 0
    for (const l of e.budget || []) {
      await q(
        `insert into budget_line (event_id, category_id, name, sort, fc_qty, fc_unit,
           fc_qty2, fc_unit2, fc_unit_cost, fc_total, ac_total, status, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [ev.id, cat[l.cat], (l.sub ? l.sub + ' › ' : '') + l.name, sort++,
         l.qty || null, l.unit || null, l.qty2 || null, l.unit2 || null, l.price || null,
         l.calc && l.price ? Math.round((l.qty || 1) * (l.qty2 || 1) * l.price) : (l.fc || 0),
         l.ac || 0, ['planned','committed','paid'].includes(l.st) ? l.st : 'planned', l.sub || null])
    }

    // ---- เวที
    const stage = {}
    for (const [i, name] of (e.stages || []).entries()) {
      const s = await one(`insert into stage (event_id, code, name, sort) values ($1,$2,$3,$4) returning id`,
                          [ev.id, name.slice(0, 40), name, i])
      stage[name] = s.id
    }
    const person = {}
    for (const s of e.sessions || []) {
      if (!stage[s.stage]) continue
      const t = String(s.time || '').split('-')
      const ss = await one(
        `insert into session (event_id, stage_id, day_no, on_date, starts_at, ends_at, minutes,
           kind, title, title_confirmed, time_locked, script_url, remark)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [ev.id, stage[s.stage], s.day || 1, s.date || null,
         t[0] || null, t[1] || null, +s.min || null,
         ['talk','panel','break','ceremony','workshop','house','inhouse','agent'].includes(s.kind) ? s.kind : 'talk',
         s.title || null, !!s.cf, !!s.lock, s.script || null, s.mod || null])
      for (const [i, p] of (s.people || []).entries()) {
        const key = (p.real || p.n || '').trim()
        if (!key) continue
        if (!person[key]) {
          const pp = await one(
            `insert into person (nickname, name_th, title, phone, note) values ($1,$2,$3,$4,$5) returning id`,
            [p.n || null, p.real || null, p.pos || null, p.contact || null, p.coord || null])
          person[key] = pp.id
        }
        await q(`insert into session_person (session_id, person_id, role, status, sort)
                 values ($1,$2,'speaker',$3,$4)`,
                [ss.id, person[key], /confirm/i.test(p.st || '') ? 'confirmed' : 'invited', i])
      }
    }

    // ---- เช็กลิสต์ผู้ออกบูธ
    const tmpl = {}
    for (const [i, t] of (e.tasks || []).entries()) {
      const tt = await one(
        `insert into task_template (event_id, code, label, phase, assigned_to, required,
           due_offset_days, sort) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [ev.id, t.code, t.label, t.phase || 'asset',
         t.by === 'organiser' ? 'organiser' : 'exhibitor', t.req !== false, t.days || null, i])
      tmpl[t.code] = tt.id
    }
    for (const d of e.deals || [])
      for (const [code, done] of Object.entries(d.tasks || {}))
        if (tmpl[code] && dealId[d.id])
          await q(`insert into exhibitor_task (deal_id, template_id, done) values ($1,$2,$3)`,
                  [dealId[d.id], tmpl[code], !!done])

    // ---- ไทม์ไลน์
    for (const [i, r] of (e.timeline || []).entries())
      await q(
        `insert into timeline_task (event_id, phase, grp, name, work_by, status,
           plan_a, plan_b, act_a, act_b, day_no, plan_t1, plan_t2, act_t1, act_t2, note, extra, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [ev.id, r.ph || 'pre', r.grp, r.name, r.by || null, TL_STATUS[r.st] ?? 'plan',
         r.ph === 'on' ? null : r.a, r.ph === 'on' ? null : r.b,
         r.ph === 'on' ? null : (r.aa ?? null), r.ph === 'on' ? null : (r.ab ?? null),
         r.ph === 'on' ? (r.d ?? 0) : null,
         r.ph === 'on' ? r.t1 : null, r.ph === 'on' ? r.t2 : null,
         r.ph === 'on' ? (r.at1 || null) : null, r.ph === 'on' ? (r.at2 || null) : null,
         r.note || null, JSON.stringify(r.x || {}), i])

    // ---- ค่าตั้งหน้าจอที่ยังไม่คุ้มจะแตกเป็นตาราง
    await q(`insert into event_setting (event_id, settings) values ($1,$2)
             on conflict (event_id) do update set settings = excluded.settings`,
            [ev.id, JSON.stringify({
              logo: e.logo || null, tlRange: e.tlRange || null, tlCols: e.tlCols || [],
              buildDays: e.buildDays ?? 1, strikeDays: e.strikeDays ?? 1,
              onH0: e.onH0 ?? 7, onH1: e.onH1 ?? 23,
              manual: e.manual || null, targetNote: e.target_note || null,
              dates: e.dates || null, short: e.short || null })])

  return {
    booth: (e.booths || []).length, deal: (e.deals || []).length,
    budget: (e.budget || []).length, session: (e.sessions || []).length,
    timeline: (e.timeline || []).length,
  }
}

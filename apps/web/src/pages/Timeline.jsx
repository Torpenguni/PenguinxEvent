import React, { useEffect, useMemo, useState } from 'react'
import { api, can } from '../api.js'

/* ไทม์ไลน์ของงาน ย้ายมาจากต้นแบบ พร้อมพฤติกรรมการลากที่แก้แล้ว
   สัปดาห์ที่ 0 คือสัปดาห์ที่จัดงาน ค่าลบคือก่อนงาน เก็บเป็นเลขสัปดาห์ไม่ใช่วันที่ตายตัว
   พอเลื่อนวันงาน แผนทั้งแผนจึงขยับตามเอง */

const PHASES = [['pre', 'ก่อนงาน'], ['on', 'หน้างาน'], ['post', 'หลังงาน']]
const ST = {
  '':      { label: 'ยังไม่เริ่ม', color: 'var(--st-todo)' },
  doing:   { label: 'กำลังทำ',    color: 'var(--st-doing)' },
  done:    { label: 'เสร็จแล้ว',   color: 'var(--st-done)' },
  risk:    { label: 'ติดปัญหา',    color: 'var(--st-block)' },
}
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const monday = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const planA = (r) => Math.min(r.a, r.b)
const planB = (r) => Math.max(r.a, r.b)
const hasAct = (r) => r.aa != null && r.ab != null
const actA = (r) => Math.min(r.aa, r.ab)
const actB = (r) => Math.max(r.aa, r.ab)

export default function Timeline ({ me, event, onBack }) {
  const [ev, setEv] = useState(null)
  const [err, setErr] = useState(null)
  const [phase, setPhase] = useState('pre')
  const [pick, setPick] = useState(null)          // แถบที่เลือกอยู่ {i, w}
  const [drag, setDrag] = useState(null)
  const [saved, setSaved] = useState('')
  const writable = can(me.permissions, 'timeline', 'write')

  useEffect(() => {
    api(`/events/${event.code}/full`)
      .then((d) => setEv(d.event))
      .catch((e) => setErr(e.message))
  }, [event.code])

  /* บันทึกกลับขึ้นเซิร์ฟเวอร์ รวบการแก้รัว ๆ ให้เหลือคำขอเดียว
     สิทธิ์บังคับที่เซิร์ฟเวอร์อีกชั้น ส่วนที่ไม่มีสิทธิ์แก้จะถูกเอาค่าเดิมทับกลับ */
  const save = (next, row, fields) => {
    setEv(next)
    if (!writable || !row?._id) return
    setSaved('กำลังบันทึก…')
    api(`/events/${event.code}/timeline/${row._id}`,
      { method: 'PATCH', body: JSON.stringify(fields) })
      .then(() => setSaved('บันทึกแล้ว'))
      .catch((e) => setSaved('บันทึกไม่สำเร็จ · ' + e.message))
  }

  const rows = useMemo(() => (ev?.timeline || []).filter((r) => (r.ph || 'pre') === phase), [ev, phase])

  // ช่วงสัปดาห์ที่ต้องวาด กว้างพอครอบทุกแถบของเฟสนี้
  const [lo, hi] = useMemo(() => {
    if (!rows.length) return [-4, 4]
    let a = Infinity, b = -Infinity
    rows.forEach((r) => {
      a = Math.min(a, planA(r), hasAct(r) ? actA(r) : Infinity)
      b = Math.max(b, planB(r), hasAct(r) ? actB(r) : -Infinity)
    })
    return [a - 1, b + 1]
  }, [rows])
  const cols = useMemo(() => {
    const out = []
    for (let k = lo; k <= hi; k++) out.push(k)
    return out
  }, [lo, hi])

  const week0 = useMemo(() => {
    const d = ev?.event_date || ev?.eventDate || event.start_date
    return d ? monday(new Date(d)) : monday(new Date())
  }, [ev, event.start_date])
  const weekEnd = (k) => {
    const d = new Date(week0)
    d.setDate(d.getDate() + k * 7 + 6)
    return d
  }
  const weekLabel = (k) => { const d = weekEnd(k); return `${d.getDate()} ${TH_M[d.getMonth()]}` }
  const nowWeek = Math.round((monday(new Date()) - week0) / 604800000)

  // ---- แก้ข้อมูลรายแถว ----
  const patch = (row, fields) => {
    if (!ev) return
    const list = (ev.timeline || []).map((r) => (r === row ? { ...r, ...fields } : r))
    save({ ...ev, timeline: list }, row, fields)
  }
  const setStatus = (row, st) => {
    /* พอเริ่มลงมือแล้วตั้งแถบจริงทับตามแผนไว้ก่อน จะได้มีอะไรให้ลากปรับ
       ไม่งั้นสถานะเปลี่ยนแล้วหน้าจอไม่มีอะไรบอกว่าเริ่มเมื่อไหร่ */
    const seed = ['doing', 'done', 'risk'].includes(st) && !hasAct(row)
      ? { aa: planA(row), ab: planB(row) } : {}
    patch(row, { st, ...seed })
  }

  // ---- การลาก ----
  const barRange = (r, w) => (w === 'act' ? [actA(r), actB(r)] : [planA(r), planB(r)])
  const onDown = (e, row, k) => {
    if (!writable) return
    e.preventDefault()
    const td = e.currentTarget.getBoundingClientRect()
    const w = hasAct(row) && e.clientY - td.top >= 20 ? 'act' : 'plan'
    const [a, b] = barRange(row, w)
    const selected = pick && pick.row === row && pick.w === w
    if (!selected) {
      setPick({ row, w })
      // กดโดนตัวแถบถึงจะลากต่อได้เลย กดช่องว่างคือแค่เลือก
      if (k < a || k > b) return
    }
    const mode = k < a || k > b
      ? (Math.abs(k - a) <= Math.abs(k - b) ? 'a' : 'b')
      : k === a && k === b ? 'b' : k === a ? 'a' : k === b ? 'b' : 'move'
    setDrag({ row, w, mode, a, b, k0: k, lo: a, hi: b })
  }
  const onMove = (k) => {
    if (!drag) return
    const d = { ...drag }
    if (d.mode === 'move') { const sh = k - d.k0; d.lo = d.a + sh; d.hi = d.b + sh }
    else if (d.mode === 'a') { d.lo = Math.min(k, d.b); d.hi = Math.max(k, d.b) }
    else { d.lo = Math.min(d.a, k); d.hi = Math.max(d.a, k) }
    setDrag(d)
  }
  useEffect(() => {
    if (!drag) return
    /* ติดตัวจับตอนเริ่มลาก ไม่ใช่ตอนวาดตาราง ของต้นแบบเคยติดตอนวาดแล้วถอดตัวเองทิ้ง
       พอมีการกดที่ไม่ได้วาดใหม่ ตัวจับก็หาย การลากครั้งถัดไปจึงไม่มีวันจบ */
    const up = () => {
      const d = drag
      setDrag(null)
      const a = Math.min(d.lo, d.hi), b = Math.max(d.lo, d.hi)
      if (a === d.a && b === d.b) return
      patch(d.row, d.w === 'act' ? { aa: a, ab: b } : { a, b })
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [drag])

  /* ทุก hook ต้องถูกเรียกครบทุกครั้งที่วาด ห้าม return ออกก่อนหน้านี้เด็ดขาด
     ไม่งั้น React นับจำนวน hook ไม่ตรงกับรอบก่อนแล้วหน้าจอขาวทั้งหน้า */
  if (err) return <div className="mid"><div className="card narrow"><p className="err">{err}</p></div></div>
  if (!ev) return <p className="mid">กำลังโหลดไทม์ไลน์…</p>


  const groups = []
  rows.forEach((r) => { if (!groups.includes(r.grp)) groups.push(r.grp) })

  const cell = (row, k) => {
    const [pa, pb] = [planA(row), planB(row)]
    const ha = hasAct(row)
    const dragging = drag && drag.row === row
    const [aa, ab] = dragging && drag.w === 'act'
      ? [Math.min(drag.lo, drag.hi), Math.max(drag.lo, drag.hi)]
      : ha ? [actA(row), actB(row)] : [null, null]
    const [ppa, ppb] = dragging && drag.w === 'plan'
      ? [Math.min(drag.lo, drag.hi), Math.max(drag.lo, drag.hi)] : [pa, pb]
    const inPlan = k >= ppa && k <= ppb
    const inAct = aa != null && k >= aa && k <= ab
    const inGuide = dragging && k >= Math.min(drag.lo, drag.hi) && k <= Math.max(drag.lo, drag.hi)
    return (
      <td key={k}
        className={'tlc' + (k === nowWeek ? ' now' : '') + (inGuide ? ' guide' : '')}
        title={writable ? 'กดที่แถบเพื่อเลือก แล้วลากเพื่อเปลี่ยนสัปดาห์' : weekLabel(k)}
        onMouseDown={(e) => onDown(e, row, k)}
        onMouseMove={() => onMove(k)}>
        {inPlan && <i className={'tlplan' + (k === ppa ? ' s' : '') + (k === ppb ? ' e' : '')} />}
        {inAct && <i className={'tlact' + (k === aa ? ' s' : '') + (k === ab ? ' e' : '')}
          style={{ background: ST[row.st || ''].color }} />}
      </td>
    )
  }

  return (
    <div className="tlpage">
      <div className="bar">
        <button className="link" onClick={onBack}>← กลับ</button>
        <b>{event.name}</b>
        <span className="spacer" />
        {PHASES.map(([k, l]) => (
          <button key={k} className="link" disabled={phase === k}
            onClick={() => { setPhase(k); setPick(null) }}>{l}</button>
        ))}
        <span className="meta">{saved}</span>
      </div>

      {!writable && <p className="alert pad">บทบาทของคุณดูไทม์ไลน์ได้อย่างเดียว แก้ไม่ได้</p>}

      <div className="tlwrap">
        <table className="tl">
          <thead>
            <tr>
              <th className="tln">งาน</th>
              <th className="tls">สถานะ</th>
              <th className="tld">แผน / จริง</th>
              {cols.map((k) => (
                <th key={k} className={'tlc' + (k === nowWeek ? ' now' : '')}>{weekLabel(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr className="tlg">
                  <td colSpan={3 + cols.length}>{g}
                    <span className="meta"> · {rows.filter((r) => r.grp === g && r.st === 'done').length}
                      /{rows.filter((r) => r.grp === g).length} เสร็จ</span>
                  </td>
                </tr>
                {rows.filter((r) => r.grp === g).map((r, i) => (
                  <tr key={r._id ?? g + i}>
                    <td className="tln">
                      <b>{r.name}</b>
                      {r.by && <span className="meta">{r.by}</span>}
                    </td>
                    <td className="tls">
                      <select value={r.st || ''} disabled={!writable}
                        style={{ borderInlineStart: '4px solid ' + ST[r.st || ''].color }}
                        onChange={(e) => setStatus(r, e.target.value)}>
                        {Object.entries(ST).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="tld">
                      {weekLabel(planA(r))} – {weekLabel(planB(r))}
                      <span className={'ac' + (hasAct(r) ? '' : ' none')}>
                        {hasAct(r)
                          ? `จริง ${weekLabel(actA(r))} – ${weekLabel(actB(r))}`
                          : 'ยังไม่บันทึก'}
                      </span>
                    </td>
                    {cols.map((k) => cell(r, k))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="sub pad">เฟสนี้ยังไม่มีงาน</p>}
    </div>
  )
}

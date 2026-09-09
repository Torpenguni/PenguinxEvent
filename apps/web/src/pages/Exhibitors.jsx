import { useEffect, useMemo, useState } from 'react'
import { api, can } from '../api.js'

/* มุมมองทีมเราต่อผู้ออกบูธ ข้อมูลชุดเดียวกับที่ผู้ออกบูธเห็นในพอร์ทัล คนละมุม
   เรียงคนที่ค้างเยอะและเลยกำหนดขึ้นก่อนเสมอ เพราะหน้านี้มีไว้ตอบคำถามเดียว
   คือวันนี้ต้องตามใคร */

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
  : '—'
const daysLeft = (d) => Math.ceil((new Date(d) - new Date()) / 86400000)

export default function Exhibitors ({ me, event, onBack }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)          // ดีลที่กางเช็กลิสต์อยู่
  const [tasks, setTasks] = useState(null)
  const [filter, setFilter] = useState('all')
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const writable = can(me.permissions, 'exhibitor', 'write')

  const load = () => api(`/events/${event.code}/exhibitors`).then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [event.code])

  const openDeal = (d) => {
    if (open === d.id) return setOpen(null)
    setOpen(d.id); setTasks(null); setLink(null)
    api(`/events/${event.code}/exhibitors/${d.id}`).then(setTasks).catch((e) => setErr(e.message))
  }

  const tick = (t, done) => {
    setTasks((list) => list.map((x) => (x.template_id === t.template_id ? { ...x, done } : x)))
    api(`/events/${event.code}/exhibitors/${open}/tasks/${t.template_id}`,
      { method: 'PATCH', body: JSON.stringify({ done }) })
      .then(load)
      .catch((e) => { setErr(e.message); openDeal({ id: open }) })
  }

  // ลิงก์พอร์ทัลของบูธนั้น ทีมคัดลอกส่งเองได้ เผื่ออีเมลยังไม่เปิด
  const makeLink = (d) => {
    setBusy(true); setErr(null)
    api(`/exhibitor-access/${d.id}`,
      { method: 'POST', body: JSON.stringify({ email: d.contact_email || 'ยังไม่มีอีเมล', days: 120 }) })
      .then((res) => { setLink({ deal: d.id, ...res }); load() })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false))
  }

  const shown = useMemo(() => {
    if (!rows) return null
    if (filter === 'late') return rows.filter((r) => r.overdue > 0)
    if (filter === 'open') return rows.filter((r) => r.done < r.total)
    if (filter === 'noemail') return rows.filter((r) => !r.contact_email)
    return rows
  }, [rows, filter])

  const totals = useMemo(() => {
    if (!rows) return null
    return {
      all: rows.length,
      done: rows.filter((r) => r.done >= r.total).length,
      open: rows.filter((r) => r.done < r.total).length,
      late: rows.filter((r) => r.overdue > 0).length,
      noemail: rows.filter((r) => !r.contact_email).length,
    }
  }, [rows])

  return (
    <div className="tlpage">
      <div className="bar">
        <button className="link" onClick={onBack}>← กลับ</button>
        <b>ผู้ออกบูธ · {event.name}</b>
        <span className="spacer" />
        {[['all', 'ทั้งหมด'], ['open', 'ยังไม่ครบ'], ['late', 'เลยกำหนด'], ['noemail', 'ไม่มีอีเมล']]
          .map(([k, l]) => (
            <button key={k} className="link" disabled={filter === k}
              onClick={() => setFilter(k)}>{l}{totals && k !== 'all' ? ` ${totals[k]}` : ''}</button>
          ))}
      </div>

      {err && <p className="err pad">{err}</p>}
      {totals && (
        <p className="alert pad">ผู้ออกบูธ {totals.all} ราย · ส่งครบแล้ว {totals.done} ราย
          {totals.late > 0 && ` · เลยกำหนด ${totals.late} ราย`}
          {totals.noemail > 0 && ` · ไม่มีอีเมลติดต่อ ${totals.noemail} ราย จึงส่งเมลเตือนไม่ได้`}</p>
      )}
      {!rows && !err && <p className="sub pad">กำลังโหลด…</p>}

      <div className="exwrap">
        {shown?.map((d) => {
          const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
          return (
            <div key={d.id} className={'excard' + (open === d.id ? ' on' : '')}>
              <button className="exhead" onClick={() => openDeal(d)}>
                <span className="exname">
                  <b>{d.company}</b>
                  <span className="meta">บูธ {d.booths || '—'}
                    {d.owner ? ` · เซลล์ ${d.owner}` : ''}</span>
                </span>
                <span className="exbar" title={`${d.done} จาก ${d.total}`}>
                  <i style={{ width: pct + '%' }} />
                </span>
                <span className="excount">{d.done}/{d.total}</span>
                {d.overdue > 0 && <span className="tg red">เลยกำหนด {d.overdue}</span>}
                {!d.contact_email && <span className="tg">ไม่มีอีเมล</span>}
                {d.has_link && <span className="tg">มีลิงก์แล้ว</span>}
              </button>

              {open === d.id && (
                <div className="exbody">
                  <p className="meta">
                    {d.contact_name ? `${d.contact_name} · ` : ''}
                    {d.contact_email || 'ยังไม่มีอีเมลผู้ติดต่อ'}
                    {d.contact_phone ? ` · ${d.contact_phone}` : ''}
                    {d.last_reminder ? ` · เมลเตือนล่าสุด ${d.last_reminder}` : ''}
                  </p>

                  {!tasks && <p className="sub">กำลังโหลดเช็กลิสต์…</p>}
                  {tasks?.map((t) => {
                    const left = t.due_date ? daysLeft(t.due_date) : null
                    return (
                      <label key={t.template_id} className="exrow">
                        <input type="checkbox" checked={t.done} disabled={!writable}
                          onChange={(e) => tick(t, e.target.checked)} />
                        <span className={'exlabel' + (t.done ? ' done' : '')}>
                          {t.label}
                          {t.required && <span className="tg red">บังคับ</span>}
                        </span>
                        <span className={'exdue' + (!t.done && left !== null && left < 7 ? ' late' : '')}>
                          {t.done ? 'ส่งแล้ว'
                            : left == null ? ''
                              : left < 0 ? `เลย ${-left} วัน` : `อีก ${left} วัน`}
                          <small>{fmt(t.due_date)}</small>
                        </span>
                      </label>
                    )
                  })}

                  {writable && (
                    <div className="rowacts">
                      <button className="link" disabled={busy} onClick={() => makeLink(d)}>
                        {d.has_link ? 'ออกลิงก์พอร์ทัลใหม่' : 'สร้างลิงก์พอร์ทัล'}
                      </button>
                      {link?.deal === d.id && link.url && (
                        <button className="link" onClick={() => navigator.clipboard.writeText(link.url)}>
                          คัดลอกลิงก์ ({link.mail?.status === 'sent' ? 'ส่งเมลแล้ว' : 'เมลยังไม่เปิด ส่งเอง'})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {shown && !shown.length && <p className="sub pad">ไม่มีรายที่ตรงกับตัวกรองนี้</p>}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, can } from '../api.js'

const ST = {
  available:    { label: 'ว่าง',        fill: '#D8DCD3', ink: '#191D1A' },
  held:         { label: 'จองแล้ว',     fill: '#D08A0A', ink: '#fff' },
  contracted:   { label: 'เซ็นสัญญา',   fill: '#8E5BB0', ink: '#fff' },
  deposit_paid: { label: 'มัดจำแล้ว',   fill: '#3E7BC4', ink: '#fff' },
  paid:         { label: 'จ่ายครบ',     fill: '#2F9E62', ink: '#fff' },
  blocked:      { label: 'ไม่ขาย',      fill: '#9AA093', ink: '#fff' },
}

export default function Plan({ me, event, onBack, onTimeline }) {
  const [booths, setBooths] = useState(null)
  const [sel, setSel] = useState(null)
  const [err, setErr] = useState(null)
  const [attention, setAttention] = useState([])
  const editable = can(me.permissions, 'floorplan', 'write')

  const load = () => {
    api(`/booths?event=${event.id}`).then(setBooths).catch((e) => setErr(e.message))
    api(`/deals/attention?event=${event.id}`).then(setAttention).catch(() => {})
  }
  useEffect(load, [event.id])

  const box = useMemo(() => {
    if (!booths?.length) return null
    const xs = booths.map((b) => b.grid_x ?? 0)
    const ys = booths.map((b) => b.grid_y ?? 0)
    return {
      x: Math.min(...xs) - 1,
      y: Math.min(...ys) - 1,
      w: Math.max(...booths.map((b) => (b.grid_x ?? 0) + (b.grid_w ?? 1))) - Math.min(...xs) + 2,
      h: Math.max(...booths.map((b) => (b.grid_y ?? 0) + (b.grid_h ?? 1))) - Math.min(...ys) + 2,
    }
  }, [booths])

  async function advance(b) {
    try {
      const { status } = await api(`/booths/${b.id}/status`, { method: 'PATCH', body: '{}' })
      setBooths((rows) => rows.map((x) => (x.id === b.id ? { ...x, status } : x)))
      setSel((s) => (s?.id === b.id ? { ...s, status } : s))
    } catch (e) { setErr(e.message) }
  }

  async function release(b) {
    try {
      await api(`/booths/${b.id}/release`, { method: 'POST' })
      load(); setSel(null)
    } catch (e) { setErr(e.message) }
  }

  const overdue = attention.filter((a) => a.flag === 'overdue')
  const soon = attention.filter((a) => a.flag === 'due_soon')

  return (
    <div className="app">
      <header className="bar">
        <button className="link" onClick={onBack}>← ทุกงาน</button>
        {onTimeline && <button className="link" onClick={onTimeline}>ไทม์ไลน์</button>}
        <b>{event.name}</b>
        <span className="spacer" />
        <span className="sub">{me.user.name}</span>
      </header>

      {err && <p className="err pad">{err}</p>}

      {(overdue.length > 0 || soon.length > 0) && (
        <div className="alert pad">
          {overdue.length > 0 && <b className="red">เลยกำหนดมัดจำ {overdue.length} ราย</b>}
          {overdue.length > 0 && soon.length > 0 && ' · '}
          {soon.length > 0 && <b className="amber">ใกล้ครบกำหนดใน 7 วัน {soon.length} ราย</b>}
        </div>
      )}

      <div className="legend pad">
        {Object.entries(ST).map(([k, v]) => (
          <span key={k}><i style={{ background: v.fill }} />{v.label}
            {' '}{booths?.filter((b) => b.status === k).length ?? 0}</span>
        ))}
      </div>

      <div className="planwrap">
        {!booths && <p className="sub pad">กำลังโหลดผัง…</p>}
        {box && (
          <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="plan">
            {booths.map((b) => {
              const s = ST[b.status] ?? ST.available
              const w = b.grid_w ?? 1, h = b.grid_h ?? 1
              return (
                <g key={b.id} className="bt" tabIndex={0} role="button"
                   aria-label={`${b.code} ${s.label}`}
                   onClick={() => setSel(b)}
                   onKeyDown={(e) => e.key === 'Enter' && setSel(b)}>
                  <rect x={b.grid_x + 0.06} y={b.grid_y + 0.06}
                        width={w - 0.12} height={h - 0.12} rx={0.18} fill={s.fill} />
                  <text x={b.grid_x + w / 2} y={b.grid_y + h / 2 + 0.16}
                        textAnchor="middle" fontSize={0.46} fill={s.ink}>{b.code}</text>
                  {b.queue_len > 0 && (
                    <circle cx={b.grid_x + w - 0.28} cy={b.grid_y + 0.3} r={0.26} fill="#C2412D" />
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {sel && (
        <aside className="panel">
          <button className="x" onClick={() => setSel(null)} aria-label="ปิด">×</button>
          <h3>{sel.code}</h3>
          <p className="sub">
            <span className="pill" style={{ background: (ST[sel.status] ?? ST.available).fill }}>
              {(ST[sel.status] ?? ST.available).label}
            </span>
            {sel.zone_name ? ` · ${sel.zone_name}` : ''}
          </p>
          <dl>
            <dt>ลูกค้า</dt><dd>{sel.company ?? '—'}</dd>
            <dt>เซลล์</dt><dd>{sel.sales ?? '—'}</dd>
            <dt>ราคาตั้ง</dt><dd>{sel.list_price ? Number(sel.list_price).toLocaleString('th-TH') : '—'}</dd>
            {sel.hold_expires_at && (
              <>
                <dt>ครบกำหนดมัดจำ</dt>
                <dd>{new Date(sel.hold_expires_at).toLocaleDateString('th-TH')}</dd>
              </>
            )}
            <dt>คนรอคิว</dt><dd>{sel.queue_len ?? 0}</dd>
          </dl>
          {editable ? (
            <div className="acts">
              <button className="go" onClick={() => advance(sel)}>เลื่อนสถานะถัดไป</button>
              <button className="warn" onClick={() => release(sel)}>ปล่อยคืน แล้วเลื่อนคิวขึ้น</button>
            </div>
          ) : <p className="sub">บทบาทนี้ดูได้อย่างเดียว</p>}
        </aside>
      )}
    </div>
  )
}

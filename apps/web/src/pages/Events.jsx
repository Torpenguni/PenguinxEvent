import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Events({ me, onPick, onOut }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { api('/events').then(setRows).catch((e) => setErr(e.message)) }, [])

  return (
    <div className="mid top">
      <div className="wrap">
        <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
        <h1>เลือกงาน</h1>
        <p className="sub">คุณมีสิทธิ์เข้าถึงงานเหล่านี้</p>
        {err && <p className="err">{err}</p>}
        {!rows && !err && <p className="sub">กำลังโหลด…</p>}
        <div className="grid">
          {rows?.map((e) => (
            /* ไม่แสดงตัวเลขยอดใด ๆ ที่นี่ เพราะทุกบทบาทเห็นหน้านี้เหมือนกัน */
            <button key={e.id} className="card ev" onClick={() => onPick(e)}>
              <span className="mark">{e.brands.map((b) => b[0]).join('')}</span>
              <b>{e.name}</b>
              <span className="meta">{e.start_date ?? 'ยังไม่กำหนดวัน'}</span>
              <span className="meta">{[e.venue, e.hall].filter(Boolean).join(' · ')}</span>
              <span className="tags">
                {e.brands.map((b) => <span key={b} className="tg">{b}</span>)}
              </span>
              <span className="go">เข้าจัดการงานนี้ →</span>
            </button>
          ))}
        </div>
        <p className="sub out">
          เข้าระบบเป็น <b>{me.user.name}</b> · <button className="link" onClick={onOut}>ออกจากระบบ</button>
        </p>
      </div>
    </div>
  )
}

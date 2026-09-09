import { useEffect, useState } from 'react'
import { api } from '../api.js'

/* ฐานข้อมูลคืนวันที่มาเป็น ISO เต็มรูปแบบ เอามาโชว์ตรง ๆ จะได้ 2027-08-21T00:00:00.000Z
   ซึ่งไม่มีใครอ่านแล้วรู้เรื่อง แปลงเป็นวันที่ไทยก่อนเสมอ */
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  : 'ยังไม่กำหนดวัน'

export default function Events({ me, rows: given, onPick, onAdmin, onOut }) {
  const [rows, setRows] = useState(given ?? null)
  const [err, setErr] = useState(null)

  // App ดึงรายชื่องานให้แล้วตอนล็อกอิน ดึงเองเฉพาะตอนที่ยังไม่มา
  useEffect(() => { if (given) setRows(given) }, [given])
  useEffect(() => {
    if (given) return
    api('/events').then(setRows).catch((e) => setErr(e.message))
  }, [])

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
              {/* มีโลโก้ก็ใช้โลโก้ ไม่มีค่อยถอยไปใช้ตัวย่อของแบรนด์ */}
              {e.logo_url
                ? <img className="evlogo" src={e.logo_url} alt="" />
                : <span className="mark">{e.brands.map((b) => b[0]).join('')}</span>}
              <b>{e.name}</b>
              <span className="meta">{fmtDate(e.start_date)}</span>
              <span className="meta">{[e.venue, e.hall].filter(Boolean).join(' · ')}</span>
              <span className="tags">
                {e.brands.map((b) => <span key={b} className="tg">{b}</span>)}
              </span>
              <span className="go">เข้าจัดการงานนี้ →</span>
            </button>
          ))}
        </div>
        <p className="sub out">
          เข้าระบบเป็น <b>{me.user.name}</b>
          {onAdmin && <> · <button className="link" onClick={onAdmin}>ผู้ใช้และการแชร์</button></>}
          {' · '}<button className="link" onClick={onOut}>ออกจากระบบ</button>
        </p>
      </div>
    </div>
  )
}

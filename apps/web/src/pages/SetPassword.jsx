import { useState } from 'react'

/* หน้าตั้งรหัสผ่านจากลิงก์ในเมล เปิดได้โดยไม่ต้องล็อกอิน
   กุญแจอยู่หลัง # เบราว์เซอร์ไม่ส่งส่วนนี้ไปเซิร์ฟเวอร์ จึงไม่ตกอยู่ใน access log */
export default function SetPassword() {
  const key = location.hash.slice(1)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (pw !== pw2) return setErr('รหัสผ่านสองช่องไม่ตรงกัน')
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, password: pw }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'ตั้งรหัสผ่านไม่สำเร็จ')
      setDone(true)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!key) return <div className="mid"><div className="card narrow">
    <h1>ลิงก์ไม่ครบ</h1>
    <p className="sub">เปิดหน้านี้จากลิงก์ในอีเมลคำเชิญ</p></div></div>

  if (done) return <div className="mid"><div className="card narrow">
    <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
    <h1>ตั้งรหัสผ่านเรียบร้อย</h1>
    <p className="sub">เข้าสู่ระบบด้วยรหัสใหม่ได้เลย</p>
    <a className="bt" href="/">ไปหน้าเข้าสู่ระบบ</a></div></div>

  return (
    <div className="mid">
      <form className="card narrow" onSubmit={submit}>
        <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
        <h1>ตั้งรหัสผ่านของคุณ</h1>
        <p className="sub">รหัสนี้เป็นของคุณคนเดียว ไม่มีใครในทีมเห็น</p>
        {err && <p className="err">{err}</p>}
        <label>รหัสผ่านใหม่
          <input type="password" value={pw} minLength={10} required
                 autoComplete="new-password"
                 onChange={(e) => setPw(e.target.value)} />
        </label>
        <label>พิมพ์อีกครั้ง
          <input type="password" value={pw2} minLength={10} required
                 autoComplete="new-password"
                 onChange={(e) => setPw2(e.target.value)} />
        </label>
        <p className="sub">อย่างน้อย 10 ตัวอักษร</p>
        <button className="bt" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่าน'}</button>
      </form>
    </div>
  )
}

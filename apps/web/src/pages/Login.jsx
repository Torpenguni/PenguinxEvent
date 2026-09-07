import { useState } from 'react'
import { api, token } from '../api.js'

export default function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const { token: t } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      token.set(t)
      onDone(await api('/auth/me'))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mid">
      <form className="card narrow" onSubmit={submit}>
        <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
        <h1>เข้าสู่ระบบ</h1>
        <p className="sub">ระบบภายใน เข้าด้วยบัญชีที่ได้รับเชิญเท่านั้น</p>
        <label>อีเมล
          <input value={email} onChange={(e) => setEmail(e.target.value)}
                 type="email" autoComplete="username" required />
        </label>
        <label>รหัสผ่าน
          <input value={password} onChange={(e) => setPassword(e.target.value)}
                 type="password" autoComplete="current-password" required />
        </label>
        {err && <p className="err">{err}</p>}
        <button disabled={busy}>{busy ? 'กำลังเข้า…' : 'เข้าสู่ระบบ'}</button>
      </form>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, can } from '../api.js'

const ROLES = [
  ['admin', 'ผู้ดูแลระบบ'], ['exec', 'ผู้บริหาร'],
  ['operations', 'ปฏิบัติการ'], ['sales', 'เซลล์'],
]
const MODULES = [
  ['', 'ทั้งงานตามสิทธิ์'], ['floorplan', 'ผังบูธ'], ['deal', 'ดีลและลูกค้า'],
  ['budget', 'งบประมาณ'], ['stage', 'ตารางเวที'], ['exhibitor', 'ผู้ออกบูธ'],
  ['movein', 'การเข้าพื้นที่'],
]
const fmt = (d) => d ? new Date(d).toLocaleDateString('th-TH',
  { day: 'numeric', month: 'short', year: '2-digit' }) : '—'

/* หน้าจัดการทีมและการแชร์งาน แทนการรัน scripts/create_user.js บนเครื่อง
   ตัวหน้าจอไม่ใช่ด่านสิทธิ์ ซ่อนปุ่มไว้เฉย ๆ ของจริงกันที่ API */
export default function Admin({ me, events, onBack }) {
  const [tab, setTab] = useState('users')
  const [mail, setMail] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { api('/mail/status').then(setMail).catch(() => {}) }, [])

  return (
    <div className="mid top"><div className="wrap">
      <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
      <h1>ผู้ใช้และการแชร์</h1>
      {mail && !mail.canSend && (
        <p className="alert">อีเมลยังไม่เปิดส่งจริง
          {mail.missing?.length ? ` (ยังไม่ได้ตั้ง ${mail.missing.join(' และ ')})` : ' (MAIL_ENABLED ไม่ใช่ true)'}
          {' '}— คำเชิญจะถูกบันทึกไว้แต่ไม่ถูกส่ง ให้คัดลอกลิงก์ส่งเองไปก่อน</p>
      )}
      {mail?.redirectTo && (
        <p className="alert">โหมดทดสอบ เมลทุกฉบับถูกส่งไปที่ {mail.redirectTo} แทนผู้รับจริง</p>
      )}
      {err && <p className="err">{err}</p>}

      <p className="sub">
        <button className="link" onClick={() => setTab('users')}
                disabled={tab === 'users'}>ทีมงาน</button>
        {' · '}
        <button className="link" onClick={() => setTab('shares')}
                disabled={tab === 'shares'}>แชร์ให้คนนอก</button>
        {' · '}
        <button className="link" onClick={onBack}>กลับ</button>
      </p>

      {tab === 'users'
        ? <Users me={me} onErr={setErr} />
        : <Shares me={me} events={events} onErr={setErr} />}
    </div></div>
  )
}

function Copyable({ url }) {
  const [ok, setOk] = useState(false)
  if (!url) return null
  return <button className="link" onClick={() => {
    navigator.clipboard.writeText(url).then(() => setOk(true))
  }}>{ok ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button>
}

function Users({ me, onErr }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState({ email: '', name: '', role: 'sales' })
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)
  const writable = can(me.permissions, 'user', 'write')

  const load = () => api('/users').then(setRows).catch((e) => onErr(e.message))
  useEffect(() => { load() }, [])

  async function invite(e) {
    e.preventDefault()
    setBusy(true); onErr(null)
    try {
      const res = await api('/users/invite', { method: 'POST', body: JSON.stringify(form) })
      setLink({ email: res.email, ...res.mail })
      setForm({ email: '', name: '', role: 'sales' })
      load()
    } catch (e) { onErr(e.message) } finally { setBusy(false) }
  }

  async function act(id, path) {
    onErr(null)
    try {
      const res = await api(`/users/${id}/${path}`, { method: 'POST' })
      if (res.url) setLink({ email: res.to, ...res })
      load()
    } catch (e) { onErr(e.message) }
  }

  return (
    <>
      {writable && (
        <form className="card" onSubmit={invite}>
          <b>เชิญคนเข้าทีม</b>
          <p className="sub">ระบบส่งลิงก์ให้เขาตั้งรหัสผ่านเอง ไม่มีรหัสผ่านวิ่งผ่านอีเมลหรือแชท</p>
          <label>อีเมล
            <input type="email" required value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>ชื่อ
            <input required value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>บทบาท
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className="bt" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งคำเชิญ'}</button>
        </form>
      )}

      {link && (
        <p className="alert">ลิงก์ตั้งรหัสผ่านของ {link.email} ({link.status === 'sent'
          ? 'ส่งอีเมลแล้ว' : 'อีเมลยังไม่ถูกส่ง ให้ส่งลิงก์นี้ให้เขาเอง'}) <Copyable url={link.url} /></p>
      )}

      {!rows && <p className="sub">กำลังโหลด…</p>}
      {rows?.map((u) => (
        <div key={u.id} className="card">
          <b>{u.name}</b> <span className="tg">{ROLES.find((r) => r[0] === u.role)?.[1] ?? u.role}</span>
          {!u.active && <span className="tg red">ปิดใช้งาน</span>}
          {u.invite_pending && <span className="tg">รอตั้งรหัสผ่าน</span>}
          <div className="meta">{u.email}</div>
          <div className="meta">
            {u.has_password ? `เข้าใช้ล่าสุด ${fmt(u.last_login_at)}` : 'ยังไม่เคยตั้งรหัสผ่าน'}
            {u.invited_by ? ` · เชิญโดย ${u.invited_by}` : ''}
            {u.last_mail ? ` · เมลล่าสุด ${u.last_mail}` : ''}
          </div>
          {writable && u.active && (
            <div className="rowacts">
              <button className="link" onClick={() => act(u.id, 'resend')}>ส่งลิงก์ตั้งรหัสผ่านใหม่</button>
              {String(u.id) !== String(me.user.id) &&
                <button className="link" onClick={() => act(u.id, 'deactivate')}>ปิดบัญชี</button>}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function Shares({ me, events, onErr }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState({
    event_id: events?.[0]?.id ?? '', email: '', permission: 'view', scope_module: '', note: '',
  })
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null)
  const writable = can(me.permissions, 'share', 'write')

  const load = () => api('/shares').then(setRows).catch((e) => onErr(e.message))
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); onErr(null)
    try {
      const res = await api('/shares', {
        method: 'POST',
        body: JSON.stringify({ ...form, scope_module: form.scope_module || null }),
      })
      setLink({ email: res.email, ...res.mail })
      setForm({ ...form, email: '', note: '' })
      load()
    } catch (e) { onErr(e.message) } finally { setBusy(false) }
  }

  async function act(id, path) {
    onErr(null)
    try {
      const res = await api(`/shares/${id}/${path}`, { method: 'POST' })
      if (res.url) setLink({ email: res.to, ...res })
      load()
    } catch (e) { onErr(e.message) }
  }

  return (
    <>
      {writable && (
        <form className="card" onSubmit={submit}>
          <b>แชร์งานให้คนนอก</b>
          <p className="sub">อีเมลนอกโดเมนบริษัทได้สิทธิ์ดูอย่างเดียวเสมอ
            ต้องกดเปลี่ยนทีหลังถ้าจะให้แก้ได้</p>
          <label>งาน
            <select value={form.event_id}
                    onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
              {events?.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </label>
          <label>อีเมล
            <input type="email" required value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>ให้เห็นเฉพาะส่วน
            <select value={form.scope_module}
                    onChange={(e) => setForm({ ...form, scope_module: e.target.value })}>
              {MODULES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {!form.scope_module && (
            <p className="alert">ให้สิทธิ์ "ทั้งงาน" กับคนนอก แปลว่าเขาเห็นตัวเลขเงินด้วย
              ถ้าจะให้ผู้รับเหมาดูผัง ให้เลือกเฉพาะผังบูธ</p>
          )}
          <label>ข้อความในคำเชิญ (ไม่บังคับ)
            <input value={form.note}
                   onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <button className="bt" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งคำเชิญ'}</button>
        </form>
      )}

      {link && (
        <p className="alert">ลิงก์คำเชิญของ {link.email} ({link.status === 'sent'
          ? 'ส่งอีเมลแล้ว' : 'อีเมลยังไม่ถูกส่ง ให้ส่งลิงก์นี้ให้เขาเอง'}) <Copyable url={link.url} /></p>
      )}

      {!rows && <p className="sub">กำลังโหลด…</p>}
      {rows?.map((s) => (
        <div key={s.id} className="card">
          <b>{s.email}</b>
          {s.external && <span className="tg">คนนอก</span>}
          <span className="tg">{s.permission === 'edit' ? 'แก้ไขได้' : 'ดูอย่างเดียว'}</span>
          {s.revoked_at && <span className="tg red">ถอนแล้ว</span>}
          <div className="meta">
            {MODULES.find((m) => m[0] === (s.scope_module ?? ''))?.[1]}
            {' · '}เชิญเมื่อ {fmt(s.invited_at)}{s.invited_by ? ` โดย ${s.invited_by}` : ''}
            {' · '}{s.accepted_at ? `รับคำเชิญแล้ว ${fmt(s.accepted_at)}` : 'ยังไม่ได้กดรับ'}
            {s.last_mail ? ` · เมลล่าสุด ${s.last_mail}` : ''}
          </div>
          {writable && !s.revoked_at && (
            <div className="rowacts">
              <button className="link" onClick={() => act(s.id, 'resend')}>ส่งคำเชิญใหม่</button>
              <button className="link" onClick={() => act(s.id, 'revoke')}>ถอนสิทธิ์</button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

import { useEffect, useState } from 'react'

const MODULE_LABEL = {
  floorplan: 'ผังบูธ', deal: 'ดีลและลูกค้า', budget: 'งบประมาณ',
  stage: 'ตารางเวที', exhibitor: 'ผู้ออกบูธ', movein: 'การเข้าพื้นที่',
}

/* คนนอกกดลิงก์คำเชิญมาถึงหน้านี้
   บอกให้ชัดว่าเขาได้สิทธิ์อะไร แล้วพาไปต่อตามว่ามีบัญชีในระบบหรือยัง */
export default function AcceptInvite() {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    const key = location.hash.slice(1)
    if (!key) return setState({ error: 'เปิดหน้านี้จากลิงก์ในอีเมลคำเชิญ' })
    fetch('/api/shares/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'รับคำเชิญไม่สำเร็จ')
        return body
      })
      .then((data) => setState({ data }))
      .catch((e) => setState({ error: e.message }))
  }, [])

  if (state.loading) return <p className="mid">กำลังเปิดคำเชิญ…</p>
  if (state.error) return <div className="mid"><div className="card narrow">
    <h1>เปิดคำเชิญไม่ได้</h1><p className="err">{state.error}</p></div></div>

  const d = state.data
  return (
    <div className="mid"><div className="card narrow">
      <div className="brand"><span className="mk">PX</span><b>PenguinX Event</b></div>
      <h1>คุณได้รับเชิญเข้าดูงาน</h1>
      <p className="sub">{d.event.name}</p>
      <p>สิทธิ์ที่ได้รับ: <b>{d.permission === 'edit' ? 'แก้ไขได้' : 'ดูอย่างเดียว'}</b><br />
        ขอบเขต: <b>{d.scope_module ? MODULE_LABEL[d.scope_module] ?? d.scope_module : 'ทั้งงานตามสิทธิ์'}</b></p>
      {d.has_account
        ? <>
            <p className="sub">บัญชีของ {d.email} มีอยู่ในระบบแล้ว เข้าสู่ระบบได้เลย</p>
            <a className="bt" href="/">ไปหน้าเข้าสู่ระบบ</a>
          </>
        : <p className="sub">บันทึกการรับคำเชิญเรียบร้อยแล้ว
            ทีมงานจะเปิดบัญชีให้ {d.email} แล้วส่งลิงก์ตั้งรหัสผ่านตามมาอีกฉบับ</p>}
    </div></div>
  )
}

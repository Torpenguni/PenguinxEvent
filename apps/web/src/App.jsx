import { useEffect, useState } from 'react'
import { api, token, can } from './api.js'
import Login from './pages/Login.jsx'
import Events from './pages/Events.jsx'
import Plan from './pages/Plan.jsx'
import Timeline from './pages/Timeline.jsx'
import Exhibitors from './pages/Exhibitors.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [events, setEvents] = useState(null)
  const [evErr, setEvErr] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [view, setView] = useState('plan')   // หน้าไหนภายในงานที่เปิดอยู่

  useEffect(() => {
    if (!token.get()) return setLoading(false)
    api('/auth/me')
      .then(setMe)
      .catch(() => token.clear())
      .finally(() => setLoading(false))
  }, [])

  /* รายชื่องานดึงที่เดียวตรงนี้ ใช้ทั้งหน้าเลือกงานและหน้าแชร์
     ของเดิมหน้าเลือกงานดึงซ้ำอีกรอบด้วย กลายเป็นสองคำขอแข่งกันตอนเซิร์ฟเวอร์เพิ่งตื่น
     และถ้าพลาดก็เงียบ เพราะ catch เปล่า คนใช้เห็นแค่คำว่ากำลังโหลดค้างอยู่ */
  const loadEvents = () => {
    setEvErr(null)
    return api('/events').then(setEvents).catch((e) => setEvErr(e.message))
  }
  useEffect(() => { if (me) loadEvents() }, [me])

  if (loading) return <p className="mid">กำลังโหลด…</p>
  if (!me) return <Login onDone={setMe} />
  if (admin) return <Admin me={me} events={events} onBack={() => setAdmin(false)} />
  if (!event) {
    return <Events
      me={me}
      rows={events}
      err={evErr}
      onRetry={loadEvents}
      onPick={(e) => { setEvent(e); setView('plan') }}
      onAdmin={can(me.permissions, 'user') || can(me.permissions, 'share')
        ? () => setAdmin(true)
        : null}
      onOut={() => { token.clear(); setMe(null) }} />
  }
  const back = () => { setEvent(null); setView('plan') }
  if (view === 'timeline') return <Timeline me={me} event={event} onBack={() => setView('plan')} />
  if (view === 'exhibitor') return <Exhibitors me={me} event={event} onBack={() => setView('plan')} />
  return <Plan me={me} event={event} onBack={back}
    onTimeline={() => setView('timeline')}
    onExhibitor={can(me.permissions, 'exhibitor') ? () => setView('exhibitor') : null} />
}

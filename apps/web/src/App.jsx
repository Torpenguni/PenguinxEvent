import { useEffect, useState } from 'react'
import { api, token, can } from './api.js'
import Login from './pages/Login.jsx'
import Events from './pages/Events.jsx'
import Plan from './pages/Plan.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [events, setEvents] = useState(null)
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    if (!token.get()) return setLoading(false)
    api('/auth/me')
      .then(setMe)
      .catch(() => token.clear())
      .finally(() => setLoading(false))
  }, [])

  // รายชื่องานใช้ทั้งหน้าเลือกงานและหน้าแชร์ ดึงครั้งเดียวพอ
  useEffect(() => { if (me) api('/events').then(setEvents).catch(() => {}) }, [me])

  if (loading) return <p className="mid">กำลังโหลด…</p>
  if (!me) return <Login onDone={setMe} />
  if (admin) return <Admin me={me} events={events} onBack={() => setAdmin(false)} />
  if (!event) {
    return <Events
      me={me}
      rows={events}
      onPick={setEvent}
      onAdmin={can(me.permissions, 'user') || can(me.permissions, 'share')
        ? () => setAdmin(true)
        : null}
      onOut={() => { token.clear(); setMe(null) }} />
  }
  return <Plan me={me} event={event} onBack={() => setEvent(null)} />
}

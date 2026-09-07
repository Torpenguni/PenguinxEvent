import { useEffect, useState } from 'react'
import { api, token } from './api.js'
import Login from './pages/Login.jsx'
import Events from './pages/Events.jsx'
import Plan from './pages/Plan.jsx'

export default function App() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)

  useEffect(() => {
    if (!token.get()) return setLoading(false)
    api('/auth/me')
      .then(setMe)
      .catch(() => token.clear())
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="mid">กำลังโหลด…</p>
  if (!me) return <Login onDone={setMe} />
  if (!event) return <Events me={me} onPick={setEvent} onOut={() => { token.clear(); setMe(null) }} />
  return <Plan me={me} event={event} onBack={() => setEvent(null)} />
}

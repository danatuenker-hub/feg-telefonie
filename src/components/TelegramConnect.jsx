import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

async function call(method = 'GET') {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/telegram-link', {
    method, headers: { Authorization: `Bearer ${data.session?.access_token}` },
  })
  return res.json()
}

// Knopf "Telegram verbinden" – öffnet den Bot mit einem persönlichen Verknüpfungscode.
export default function TelegramConnect() {
  const [info, setInfo] = useState(null)
  useEffect(() => { call().then(setInfo).catch((e) => setInfo({ error: e.message })) }, [])

  if (!info) return <p className="muted small">Lädt…</p>
  if (info.error) return <p className="small error">{info.error}</p>
  return (
    <div className="row">
      {info.connected && <span className="badge termin">✓ Telegram verbunden</span>}
      <a className="btn" href={info.url} target="_blank" rel="noreferrer">{info.connected ? 'Neu verbinden' : '✈️ Telegram verbinden'}</a>
      {!info.connected && <span className="small muted">Im Bot dann auf „Start“ tippen.</span>}
    </div>
  )
}

export async function setupTelegramWebhook() {
  return call('POST')
}

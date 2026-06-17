import { useEffect, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'

export default function SettingsSheet({ open, onClose }) {
  const [token, setLocalToken] = useState('')
  const [health, setHealth] = useState(null)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!open) return
    setLocalToken(getToken())
    setMsg(null); setErr(null)
    api.health().then(setHealth).catch(e => setErr(e.message))
  }, [open])

  if (!open) return null

  function save() {
    setToken(token.trim())
    setMsg('Token saved locally. It is sent as X-Auth-Token on every request.')
    api.health().then(setHealth).catch(e => setErr(e.message))
  }
  function clear() {
    setToken(''); setLocalToken(''); setMsg('Token cleared.')
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-6">
      <div className="card w-full max-w-md max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="font-semibold">Settings</div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <Section title="Backend">
            {health ? (
              <ul className="text-sm space-y-1">
                <li>Status: <span className="text-emerald-300">{health.ok ? 'ok' : 'down'}</span></li>
                <li>GitHub: {health.github_configured
                  ? <span className="text-emerald-300">configured</span>
                  : <span className="text-rose-300">missing GITHUB_TOKEN</span>}</li>
                <li>Auth required: {health.auth_required
                  ? <span className="text-amber-300">yes</span>
                  : <span className="text-slate-300">no</span>}</li>
              </ul>
            ) : <div className="text-sm text-slate-400">Checking…</div>}
          </Section>

          <Section title="API token">
            <div className="text-xs text-slate-400 mb-2">
              Optional. Required only if you set <code>AUTH_TOKEN</code> in the
              backend <code>.env</code>. Stored in this browser's localStorage.
            </div>
            <input
              className="input"
              placeholder="paste token"
              value={token}
              onChange={e => setLocalToken(e.target.value)}
              type="password"
              autoComplete="off"
            />
            <div className="flex gap-2 mt-2">
              <button className="btn-primary" onClick={save}>Save</button>
              <button className="btn-ghost" onClick={clear}>Clear</button>
            </div>
          </Section>

          {msg && <div className="text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">{msg}</div>}
          {err && <div className="text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">{err}</div>}

          <Section title="About">
            <div className="text-xs text-slate-400">
              Investment Hub v0.2 · React + FastAPI · No DB. Single user.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{title}</div>
      {children}
    </div>
  )
}

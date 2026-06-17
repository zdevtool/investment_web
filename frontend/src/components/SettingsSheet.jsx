import { useEffect, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'
import {
  notifyEnabled, setNotifyEnabled,
  permissionState, requestPermission,
} from '../lib/notify'

export default function SettingsSheet({ open, onClose }) {
  const [token, setLocalToken] = useState('')
  const [health, setHealth] = useState(null)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [notif, setNotif] = useState(false)
  const [permState, setPermState] = useState('default')

  useEffect(() => {
    if (!open) return
    setLocalToken(getToken())
    setMsg(null); setErr(null)
    setNotif(notifyEnabled())
    setPermState(permissionState())
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

  async function toggleNotif(checked) {
    if (checked) {
      const r = await requestPermission()
      setPermState(r)
      if (r === 'granted') {
        setNotifyEnabled(true); setNotif(true)
        setMsg('Notifications enabled. You will be alerted when runs complete.')
      } else {
        setNotifyEnabled(false); setNotif(false)
        setErr(r === 'unsupported'
          ? 'This browser does not support Notifications.'
          : 'Permission was not granted.')
      }
    } else {
      setNotifyEnabled(false); setNotif(false)
      setMsg('Notifications disabled.')
    }
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

          <Section title="Notifications">
            <div className="text-xs text-slate-400 mb-2">
              Browser alert when a workflow you triggered finishes. Permission state:{' '}
              <span className={
                permState === 'granted' ? 'text-emerald-300'
                : permState === 'denied' ? 'text-rose-300'
                : 'text-slate-300'
              }>{permState}</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notif}
                onChange={e => toggleNotif(e.target.checked)}
                disabled={permState === 'unsupported'}
              />
              <span>Notify me when runs complete</span>
            </label>
          </Section>

          <Section title="About">
            <div className="text-xs text-slate-400">
              Investment Hub v0.3 · React + FastAPI · No DB. Single user.
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

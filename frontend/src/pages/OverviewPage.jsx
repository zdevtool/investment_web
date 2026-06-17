import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtTime, statusPill } from '../lib/format'

const ICONS = { trading_pal: '📈', option_pal: '🎯', heartbeat_pal: '💓' }
const EXTRA_LABEL = {
  trading_pal: 'symbols in pool',
  option_pal: 'open positions',
  heartbeat_pal: 'open positions',
}

export default function OverviewPage({ onJump }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [triggeringKey, setTriggeringKey] = useState(null)
  const [toast, setToast] = useState(null)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const d = await api.overview()
      setData(d)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  async function quickTrigger(key) {
    setTriggeringKey(key); setErr(null)
    const inputsByKey = {
      trading_pal: { run_type: 'manual' },
      option_pal: { skip_market_check: 'true' },
      heartbeat_pal: undefined,
    }
    try {
      await api.trigger(key, { inputs: inputsByKey[key] })
      setToast(`Dispatched ${key}.`)
      setTimeout(() => setToast(null), 3000)
      setTimeout(load, 4000)
    } catch (e) {
      setErr(`${key}: ${e.message}`)
    } finally {
      setTriggeringKey(null)
    }
  }

  if (!data && loading) {
    return <div className="card p-5 text-slate-400 text-sm">Loading overview…</div>
  }
  if (err && !data) {
    return <div className="card p-5 text-rose-300 text-sm">Error: {err}</div>
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold">Overview</div>
          <button className="btn-ghost text-xs" onClick={load} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
        <div className="text-xs text-slate-400">
          {data.github_configured
            ? 'Pulling latest run for each module from GitHub. Auto-refresh every 30s.'
            : 'GitHub token not set — showing locally cached runs only.'}
        </div>
        {toast && (
          <div className="mt-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">
            {toast}
          </div>
        )}
        {err && data && (
          <div className="mt-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">
            {err}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {data.modules.map(m => {
          const pill = statusPill(m.latest)
          const live = m.live
          const extraVal =
            m.candidate_count != null ? m.candidate_count :
            m.open_positions != null ? m.open_positions : null
          return (
            <div key={m.key} className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl leading-none">{ICONS[m.key] || '•'}</span>
                    <span className="font-semibold">{m.name}</span>
                    {live && <span className="pill bg-emerald-500/15 text-emerald-300 animate-pulse">live</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {m.repo} · <code className="text-slate-300">{m.workflow}</code>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => onJump?.(m.key)}
                  >
                    Open
                  </button>
                  <button
                    className="btn-primary text-xs"
                    onClick={() => quickTrigger(m.key)}
                    disabled={triggeringKey === m.key}
                  >
                    {triggeringKey === m.key ? '…' : 'Run'}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-ink-800/60 border border-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Latest</div>
                  {m.latest ? (
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">#{m.latest.run_number}</span>
                      <span className={`pill text-[10px] ${pill.cls}`}>{pill.label}</span>
                    </div>
                  ) : <div className="mt-1 text-slate-400 text-xs">No runs</div>}
                </div>
                <div className="rounded-lg bg-ink-800/60 border border-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">When</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {m.latest?.created_at ? fmtTime(m.latest.created_at) : '—'}
                  </div>
                </div>
                {extraVal != null && (
                  <div className="rounded-lg bg-ink-800/60 border border-white/5 p-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      {EXTRA_LABEL[m.key]}
                    </div>
                    <div className="mt-1 text-base font-semibold text-emerald-300">{extraVal}</div>
                  </div>
                )}
              </div>

              {m.error && (
                <div className="mt-2 text-xs rounded-lg bg-rose-500/10 text-rose-200 px-3 py-1.5 border border-rose-500/20 break-words">
                  {m.error}
                </div>
              )}

              {m.latest?.html_url && (
                <a className="text-emerald-400 text-xs hover:underline mt-2 inline-block"
                   href={m.latest.html_url} target="_blank" rel="noreferrer">
                  Open on GitHub ↗
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtTime, statusPill } from '../lib/format'

export default function RunsPanel({ moduleKey, triggerInputs = null }) {
  const [runs, setRuns] = useState([])
  const [grouped, setGrouped] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [triggering, setTriggering] = useState(false)
  const [openRun, setOpenRun] = useState(null)
  const [logText, setLogText] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [toast, setToast] = useState(null)

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const data = await api.runs(moduleKey)
      setRuns(data.runs || [])
      const g = await api.runsGrouped(moduleKey)
      setGrouped(g.by_date || {})
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadGroupedOnly() {
    try {
      const g = await api.runsGrouped(moduleKey)
      setGrouped(g.by_date || {})
    } catch (e) { /* non-fatal */ }
  }

  useEffect(() => {
    loadGroupedOnly()
    refresh()
  }, [moduleKey])

  async function onTrigger() {
    setTriggering(true); setError(null)
    try {
      await api.trigger(moduleKey, { inputs: triggerInputs || undefined })
      setToast('Workflow dispatched. New run will appear shortly.')
      setTimeout(() => { refresh(); setToast(null) }, 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setTriggering(false)
    }
  }

  async function openLog(runId, refresh = false) {
    setOpenRun(runId); setLogLoading(true); setLogText('')
    try {
      const data = await api.runLog(moduleKey, runId, refresh)
      setLogText(data.log || '(empty)')
    } catch (e) {
      setLogText(`Error: ${e.message}`)
    } finally {
      setLogLoading(false)
    }
  }

  const latest = runs[0]
  const latestPill = statusPill(latest)

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm uppercase tracking-wide text-slate-400">Latest run</div>
            {latest ? (
              <div className="mt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">#{latest.run_number}</span>
                  <span className={`pill ${latestPill.cls}`}>{latestPill.label}</span>
                  <span className="text-slate-400 text-sm">{latest.event}</span>
                </div>
                <div className="text-slate-400 text-sm mt-1">{fmtTime(latest.created_at)}</div>
                <a href={latest.html_url} target="_blank" rel="noreferrer"
                   className="text-emerald-400 text-sm hover:underline">
                  Open on GitHub ↗
                </a>
              </div>
            ) : (
              <div className="text-slate-400 mt-1">No runs yet.</div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn-ghost" onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn-primary" onClick={onTrigger} disabled={triggering}>
              {triggering ? 'Dispatching…' : 'Trigger Run'}
            </button>
          </div>
        </div>

        {toast && (
          <div className="mt-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">
            {toast}
          </div>
        )}
        {error && (
          <div className="mt-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">
            {error}
          </div>
        )}

        {latest && (
          <div className="mt-4">
            <button className="btn-ghost" onClick={() => openLog(latest.id)}>
              View Log
            </button>
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">History (by date)</div>
          <div className="text-xs text-slate-400">
            {Object.keys(grouped).length} day(s)
          </div>
        </div>

        <div className="space-y-3">
          {Object.keys(grouped).length === 0 && (
            <div className="text-slate-400 text-sm">No cached history yet. Hit Refresh.</div>
          )}
          {Object.entries(grouped).map(([date, items]) => (
            <details key={date} className="rounded-xl bg-ink-800/60 border border-white/5">
              <summary className="cursor-pointer px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium">{date}</span>
                <span className="text-xs text-slate-400">{items.length} run(s)</span>
              </summary>
              <div className="px-2 pb-2 space-y-1">
                {items.map(r => {
                  const p = statusPill(r)
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-ink-800">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">#{r.run_number}</span>
                          <span className={`pill ${p.cls}`}>{p.label}</span>
                          <span className="text-xs text-slate-400">{r.event}</span>
                        </div>
                        <div className="text-xs text-slate-400">{fmtTime(r.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openLog(r.id)}>Log</button>
                        {r.html_url && (
                          <a href={r.html_url} target="_blank" rel="noreferrer"
                             className="btn-ghost px-2 py-1 text-xs">GitHub</a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          ))}
        </div>
      </div>

      {openRun && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-6">
          <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="font-semibold">Run #{openRun} log</div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost text-xs" onClick={() => openLog(openRun, true)}>Refetch</button>
                <button className="btn-ghost text-xs" onClick={() => { setOpenRun(null); setLogText('') }}>Close</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
              {logLoading ? 'Loading…' : (logText || '(empty)')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

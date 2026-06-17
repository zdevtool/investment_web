import { useEffect, useRef, useState } from 'react'
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
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const pollRef = useRef(null)
  const triggerSnapshotRef = useRef(null)

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const data = await api.runs(moduleKey)
      setRuns(data.runs || [])
      const g = await api.runsGrouped(moduleKey)
      setGrouped(g.by_date || {})
      return data.runs || []
    } catch (e) { setError(e.message); return [] }
    finally { setLoading(false) }
  }

  async function loadGroupedOnly() {
    try {
      const g = await api.runsGrouped(moduleKey)
      setGrouped(g.by_date || {})
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    setRuns([]); setGrouped({}); setSummary(null)
    loadGroupedOnly()
    refresh()
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey])

  function stopPolling() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
  }
  function schedulePoll(ms = 8000) {
    stopPolling()
    pollRef.current = setTimeout(async () => {
      const fresh = await refresh()
      const latest = fresh[0]
      const stillRunning = latest && (latest.status === 'in_progress' || latest.status === 'queued')
      const newSinceTrigger = triggerSnapshotRef.current &&
        latest && Number(latest.id) !== Number(triggerSnapshotRef.current)
      if (stillRunning) schedulePoll(ms)
      else if (!newSinceTrigger && triggerSnapshotRef.current) schedulePoll(Math.min(ms * 1.5, 20000))
      else triggerSnapshotRef.current = null
    }, ms)
  }

  async function onTrigger() {
    setTriggering(true); setError(null)
    try {
      triggerSnapshotRef.current = runs[0]?.id || null
      await api.trigger(moduleKey, { inputs: triggerInputs || undefined })
      setToast('Workflow dispatched. Polling for new run…')
      schedulePoll(4000)
      setTimeout(() => setToast(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setTriggering(false)
    }
  }

  async function onCancel(runId) {
    if (!runId) return
    setCancelling(true); setError(null)
    try {
      await api.cancelRun(moduleKey, runId)
      setToast(`Cancellation requested for #${runId}`)
      schedulePoll(3000)
      setTimeout(() => setToast(null), 3000)
    } catch (e) { setError(e.message) }
    finally { setCancelling(false) }
  }

  async function openLog(runId, force = false) {
    setOpenRun(runId); setLogLoading(true); setLogText('')
    setSummary(null); setSummaryLoading(true)
    try {
      const [logResp, sumResp] = await Promise.allSettled([
        api.runLog(moduleKey, runId, force),
        api.runSummary(moduleKey, runId),
      ])
      if (logResp.status === 'fulfilled') setLogText(logResp.value.log || '(empty)')
      else setLogText(`Error: ${logResp.reason?.message || logResp.reason}`)
      if (sumResp.status === 'fulfilled') setSummary(sumResp.value.summary || null)
    } finally {
      setLogLoading(false); setSummaryLoading(false)
    }
  }

  const latest = runs[0]
  const latestPill = statusPill(latest)
  const latestRunning = latest && (latest.status === 'in_progress' || latest.status === 'queued')

  // Auto-poll if latest is running, even without explicit trigger.
  useEffect(() => {
    if (latestRunning && !pollRef.current) schedulePoll(8000)
    if (!latestRunning && !triggerSnapshotRef.current) stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRunning])

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
                  {latestRunning && (
                    <span className="pill bg-emerald-500/10 text-emerald-300 animate-pulse">live</span>
                  )}
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

          <div className="flex gap-2 flex-wrap">
            <button className="btn-ghost" onClick={refresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {latestRunning && (
              <button className="btn-ghost text-rose-300"
                      onClick={() => onCancel(latest.id)} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
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
          <div className="mt-4 flex gap-2 flex-wrap">
            <button className="btn-ghost" onClick={() => openLog(latest.id)}>
              View Log & Summary
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
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-2 sm:p-6">
          <div className="card w-full max-w-3xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="font-semibold">Run #{openRun}</div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost text-xs" onClick={() => openLog(openRun, true)}>Refetch</button>
                <button className="btn-ghost text-xs" onClick={() => { setOpenRun(null); setLogText(''); setSummary(null) }}>Close</button>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-white/5">
              <SummaryCard moduleKey={moduleKey} summary={summary} loading={summaryLoading} />
            </div>

            <div className="flex-1 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
              {logLoading ? 'Loading log…' : (logText || '(empty)')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ moduleKey, summary, loading }) {
  if (loading) return <div className="text-slate-400 text-sm">Parsing summary…</div>
  if (!summary || summary.available === false)
    return <div className="text-slate-400 text-sm">No structured summary.</div>

  if (moduleKey === 'trading_pal') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {summary.regime && <span className="pill bg-emerald-500/15 text-emerald-200">regime: {summary.regime}</span>}
          <span className="pill bg-ink-800 text-slate-200 border border-white/10">{summary.order_count} signal(s)</span>
        </div>
        {summary.headline && <div className="text-xs text-slate-400">{summary.headline}</div>}
        {summary.orders?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {summary.orders.map((o, i) => (
              <span key={i} className={`pill ${sideClass(o.side)}`}>
                {o.side} {o.symbol}{o.qty ? ` ×${o.qty}` : ''}
              </span>
            ))}
          </div>
        )}
        {summary.errors?.length > 0 && <ErrorList errors={summary.errors} />}
      </div>
    )
  }

  if (moduleKey === 'option_pal') {
    const m = summary.metrics || {}
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="pill bg-emerald-500/15 text-emerald-200">calls {m.calls ?? 0}</span>
          <span className="pill bg-sky-500/15 text-sky-200">puts {m.puts ?? 0}</span>
          <span className="pill bg-amber-500/15 text-amber-200">closes {m.close_alerts ?? 0}</span>
          <span className="pill bg-violet-500/15 text-violet-200">rolls {m.rolls ?? 0}</span>
        </div>
        {summary.headline && <div className="text-xs text-slate-400">{summary.headline}</div>}
        {summary.errors?.length > 0 && <ErrorList errors={summary.errors} />}
      </div>
    )
  }

  if (moduleKey === 'heartbeat_pal') {
    const t = summary.tiers || {}
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {summary.pool_size != null &&
            <span className="pill bg-ink-800 text-slate-200 border border-white/10">pool {summary.pool_size}</span>}
          <span className="pill bg-rose-500/15 text-rose-200">CRITICAL {t.CRITICAL ?? 0}</span>
          <span className="pill bg-orange-500/15 text-orange-200">HIGH {t.HIGH ?? 0}</span>
          <span className="pill bg-amber-500/15 text-amber-200">MEDIUM {t.MEDIUM ?? 0}</span>
        </div>
        {summary.top?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {summary.top.map((a, i) => (
              <span key={i} className={`pill ${tierBg(a.tier)}`}>
                {a.tier[0]} {a.symbol}{a.score ? ` (${a.score})` : ''}
              </span>
            ))}
          </div>
        )}
        {summary.errors?.length > 0 && <ErrorList errors={summary.errors} />}
      </div>
    )
  }

  return null
}

function sideClass(side) {
  if (side === 'BUY' || side === 'ADD') return 'bg-emerald-500/15 text-emerald-200'
  if (side === 'SELL' || side === 'TRIM') return 'bg-rose-500/15 text-rose-200'
  return 'bg-slate-500/15 text-slate-200'
}

function tierBg(tier) {
  const t = String(tier).toUpperCase()
  if (t === 'CRITICAL') return 'bg-rose-500/15 text-rose-200'
  if (t === 'HIGH') return 'bg-orange-500/15 text-orange-200'
  return 'bg-amber-500/15 text-amber-200'
}

function ErrorList({ errors }) {
  return (
    <details className="text-xs text-rose-300">
      <summary>{errors.length} error line(s)</summary>
      <ul className="mt-1 space-y-0.5 font-mono break-words">
        {errors.slice(0, 5).map((e, i) => <li key={i} className="pl-2">• {e}</li>)}
      </ul>
    </details>
  )
}

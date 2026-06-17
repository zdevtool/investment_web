import { useEffect, useState } from 'react'
import RunsPanel from '../components/RunsPanel'
import { api } from '../lib/api'

export default function HeartbeatPalPage() {
  const [predictions, setPredictions] = useState([])
  const [portfolio, setPortfolio] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.heartbeatPredictions().then(d => setPredictions(d.predictions || [])).catch(e => setErr(e.message))
    api.heartbeatPortfolio().then(d => setPortfolio(d.portfolio || {})).catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <RunsPanel moduleKey="heartbeat_pal" />

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Recent Predictions</div>
            <div className="text-xs text-slate-400">
              Read-only snapshot of <code>heartbeat_pal/predictions.json</code> (last 100).
            </div>
          </div>
        </div>

        {err && <div className="mb-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">{err}</div>}
        {predictions.length === 0 ? (
          <div className="text-slate-400 text-sm">No predictions yet.</div>
        ) : (
          <div className="space-y-2">
            {predictions.slice(-100).reverse().map((p, i) => (
              <div key={i} className="rounded-xl bg-ink-800/60 border border-white/5 p-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base">{p.ticker || p.symbol || '?'}</span>
                  {p.tier && <span className={`pill ${tierClass(p.tier)}`}>{p.tier}</span>}
                  {(p.final_score ?? p.score) != null &&
                    <span className="text-emerald-300 text-xs">score {Math.round(p.final_score ?? p.score)}</span>}
                  {p.predicted_at && <span className="text-xs text-slate-400">{p.predicted_at}</span>}
                </div>
                {p.rationale && (
                  <div className="text-slate-400 text-xs mt-1 break-words">
                    {typeof p.rationale === 'string' ? p.rationale : JSON.stringify(p.rationale)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {portfolio && (
        <div className="card p-4 sm:p-5">
          <div className="font-semibold mb-2">Portfolio (read-only)</div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-slate-300">
            {JSON.stringify(portfolio, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function tierClass(tier) {
  const t = String(tier).toUpperCase()
  if (t === 'CRITICAL') return 'bg-rose-500/20 text-rose-200'
  if (t === 'HIGH') return 'bg-orange-500/20 text-orange-200'
  if (t === 'MEDIUM') return 'bg-amber-500/20 text-amber-200'
  return 'bg-slate-500/20 text-slate-200'
}

import { useEffect, useState } from 'react'
import RunsPanel from '../components/RunsPanel'
import { api } from '../lib/api'

const EMPTY_POS = {
  ticker: '', shares: 0, avg_entry: 0, total_cost: 0,
  status: 'open', current_stop: 0, trailing_stop: 0, notes: '',
}

export default function HeartbeatPalPage() {
  const [predictions, setPredictions] = useState([])
  const [portfolio, setPortfolio] = useState(null)
  const [account, setAccount] = useState({})
  const [positions, setPositions] = useState([])
  const [extraText, setExtraText] = useState('{}')
  const [savingPort, setSavingPort] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  function hydrate(p) {
    const safe = p && typeof p === 'object' ? p : {}
    setPortfolio(safe)
    setAccount(safe.account || {})
    setPositions(Array.isArray(safe.positions) ? safe.positions : [])
    const { account: _a, positions: _p, ...rest } = safe
    setExtraText(JSON.stringify(rest, null, 2))
  }

  async function load() {
    try {
      const preds = await api.heartbeatPredictions()
      setPredictions(preds.predictions || [])
      const port = await api.heartbeatPortfolio()
      hydrate(port.portfolio || {})
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => { load() }, [])

  function updateAccount(field, value) {
    setAccount(prev => ({ ...prev, [field]: value }))
  }
  function updatePos(idx, field, value) {
    setPositions(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }
  function addPos() {
    setPositions(prev => [{ ...EMPTY_POS }, ...prev])
  }
  function removePos(idx) {
    setPositions(prev => prev.filter((_, i) => i !== idx))
  }

  async function savePortfolio() {
    setSavingPort(true); setErr(null); setMsg(null)
    try {
      let extra = {}
      try { extra = extraText.trim() ? JSON.parse(extraText) : {} }
      catch (e) { throw new Error('Advanced JSON invalid: ' + e.message) }

      const cleanedPos = positions.map(p => ({
        ...p,
        shares: Number(p.shares) || 0,
        avg_entry: Number(p.avg_entry) || 0,
        total_cost: Number(p.total_cost) || 0,
        current_stop: Number(p.current_stop) || 0,
        trailing_stop: Number(p.trailing_stop) || 0,
      }))
      const cleanedAcc = Object.fromEntries(Object.entries(account).map(([k, v]) => {
        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return [k, Number(v)]
        return [k, v]
      }))

      const body = { ...extra, account: cleanedAcc, positions: cleanedPos }
      await api.saveHeartbeatPortfolio(body)
      setPortfolio(body)
      setPositions(cleanedPos)
      setAccount(cleanedAcc)
      setMsg('Portfolio saved to heartbeat_pal/portfolio.json')
      setTimeout(() => setMsg(null), 2500)
    } catch (e) { setErr(e.message) }
    finally { setSavingPort(false) }
  }

  const accountFields = [
    ['initial_capital', 'Initial Capital'],
    ['current_capital', 'Current Capital'],
    ['max_concurrent_positions', 'Max Positions'],
    ['risk_per_trade_pct', 'Risk / Trade %'],
  ]

  return (
    <div className="space-y-5">
      <RunsPanel moduleKey="heartbeat_pal" />

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Account</div>
            <div className="text-xs text-slate-400">
              Edits write to <code>heartbeat_pal/portfolio.json</code>.
            </div>
          </div>
          <button className="btn-primary" onClick={savePortfolio} disabled={savingPort}>
            {savingPort ? 'Saving…' : 'Save Portfolio'}
          </button>
        </div>

        {err && <div className="mb-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">{err}</div>}
        {msg && <div className="mb-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">{msg}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {accountFields.map(([k, label]) => (
            <Field key={k} label={label} type="number"
              value={account[k] ?? ''}
              onChange={v => updateAccount(k, v)} />
          ))}
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Positions</div>
            <div className="text-xs text-slate-400">
              {positions.filter(p => p.status === 'open').length} open · {positions.length} total
            </div>
          </div>
          <button className="btn-ghost" onClick={addPos}>+ Add</button>
        </div>

        <div className="space-y-3">
          {positions.length === 0 && <div className="text-slate-400 text-sm">No positions.</div>}
          {positions.map((row, idx) => (
            <div key={idx} className="rounded-xl bg-ink-800/60 border border-white/5 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Ticker" value={row.ticker}
                  onChange={v => updatePos(idx, 'ticker', v.toUpperCase())} />
                <Field label="Shares" type="number" value={row.shares}
                  onChange={v => updatePos(idx, 'shares', v)} />
                <Field label="Avg Entry" type="number" value={row.avg_entry}
                  onChange={v => updatePos(idx, 'avg_entry', v)} />
                <SelectField label="Status" value={row.status || 'open'}
                  onChange={v => updatePos(idx, 'status', v)}
                  options={[['open', 'open'], ['closed', 'closed'], ['watching', 'watching']]} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                <Field label="Total Cost" type="number" value={row.total_cost}
                  onChange={v => updatePos(idx, 'total_cost', v)} />
                <Field label="Current Stop" type="number" value={row.current_stop}
                  onChange={v => updatePos(idx, 'current_stop', v)} />
                <Field label="Trailing Stop" type="number" value={row.trailing_stop}
                  onChange={v => updatePos(idx, 'trailing_stop', v)} />
              </div>
              <Field label="Notes" value={row.notes || ''}
                onChange={v => updatePos(idx, 'notes', v)} />
              <div className="flex justify-end mt-2">
                <button className="btn-ghost text-xs text-rose-300" onClick={() => removePos(idx)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <button className="text-sm text-slate-400 hover:text-slate-200"
                onClick={() => setShowAdvanced(s => !s)}>
          {showAdvanced ? '▾' : '▸'} Advanced JSON (other portfolio fields)
        </button>
        {showAdvanced && (
          <textarea
            className="input min-h-[160px] mt-3"
            value={extraText}
            onChange={e => setExtraText(e.target.value)}
          />
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Recent Predictions</div>
            <div className="text-xs text-slate-400">
              Read-only snapshot of <code>heartbeat_pal/predictions.json</code> (last 100).
            </div>
          </div>
        </div>

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
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">{label}</span>
      <input className="input" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">{label}</span>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function tierClass(tier) {
  const t = String(tier).toUpperCase()
  if (t === 'CRITICAL') return 'bg-rose-500/20 text-rose-200'
  if (t === 'HIGH') return 'bg-orange-500/20 text-orange-200'
  if (t === 'MEDIUM') return 'bg-amber-500/20 text-amber-200'
  return 'bg-slate-500/20 text-slate-200'
}

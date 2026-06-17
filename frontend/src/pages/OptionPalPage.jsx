import { useEffect, useState } from 'react'
import RunsPanel from '../components/RunsPanel'
import { api } from '../lib/api'

const EMPTY_OPT = {
  id: '', ticker: '', type: 'put', strike: 0, expiry: '',
  quantity: 1, entry_premium: 0, entry_date: '', notes: '',
}

export default function OptionPalPage() {
  const [positions, setPositions] = useState([])
  const [account, setAccount] = useState(null)
  const [accountText, setAccountText] = useState('{}')
  const [savingPos, setSavingPos] = useState(false)
  const [savingAcc, setSavingAcc] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      const p = await api.optionPositions()
      setPositions(p.positions || [])
      const a = await api.optionAccount()
      setAccount(a.account || {})
      setAccountText(JSON.stringify(a.account || {}, null, 2))
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  function updateRow(idx, field, value) {
    setPositions(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  function addRow() {
    setPositions(prev => [{ ...EMPTY_OPT }, ...prev])
  }

  function removeRow(idx) {
    setPositions(prev => prev.filter((_, i) => i !== idx))
  }

  async function savePositions() {
    setSavingPos(true); setErr(null); setMsg(null)
    try {
      const cleaned = positions.map(p => ({
        ...p,
        strike: Number(p.strike) || 0,
        quantity: Number(p.quantity) || 0,
        entry_premium: Number(p.entry_premium) || 0,
      }))
      await api.saveOptionPositions(cleaned)
      setPositions(cleaned)
      setMsg('Positions saved to option_pal/positions.json')
      setTimeout(() => setMsg(null), 2500)
    } catch (e) { setErr(e.message) }
    finally { setSavingPos(false) }
  }

  async function saveAccount() {
    setSavingAcc(true); setErr(null); setMsg(null)
    try {
      const obj = JSON.parse(accountText)
      await api.saveOptionAccount(obj)
      setAccount(obj)
      setMsg('Account saved to option_pal/account.json')
      setTimeout(() => setMsg(null), 2500)
    } catch (e) { setErr(e.message) }
    finally { setSavingAcc(false) }
  }

  return (
    <div className="space-y-5">
      <RunsPanel moduleKey="option_pal" triggerInputs={{ skip_market_check: 'true' }} />

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Option Holdings</div>
            <div className="text-xs text-slate-400">Edits write to <code>option_pal/positions.json</code>.</div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={addRow}>+ Add</button>
            <button className="btn-primary" onClick={savePositions} disabled={savingPos}>
              {savingPos ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {err && <div className="mb-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">{err}</div>}
        {msg && <div className="mb-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">{msg}</div>}

        <div className="space-y-3">
          {positions.length === 0 && <div className="text-slate-400 text-sm">No positions.</div>}
          {positions.map((row, idx) => (
            <div key={idx} className="rounded-xl bg-ink-800/60 border border-white/5 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <Field label="Ticker" value={row.ticker} onChange={v => updateRow(idx, 'ticker', v.toUpperCase())} />
                <SelectField label="Type" value={row.type} onChange={v => updateRow(idx, 'type', v)}
                  options={[['put', 'PUT'], ['call', 'CALL']]} />
                <Field label="Strike" type="number" value={row.strike} onChange={v => updateRow(idx, 'strike', v)} />
                <Field label="Expiry" type="date" value={row.expiry} onChange={v => updateRow(idx, 'expiry', v)} />
                <Field label="Qty" type="number" value={row.quantity} onChange={v => updateRow(idx, 'quantity', v)} />
                <Field label="Premium" type="number" value={row.entry_premium} onChange={v => updateRow(idx, 'entry_premium', v)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <Field label="ID" value={row.id} onChange={v => updateRow(idx, 'id', v)} />
                <Field label="Notes" value={row.notes || ''} onChange={v => updateRow(idx, 'notes', v)} />
              </div>
              <div className="flex justify-end mt-2">
                <button className="btn-ghost text-xs text-rose-300" onClick={() => removeRow(idx)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Account / Portfolio Holdings</div>
            <div className="text-xs text-slate-400">Edits write to <code>option_pal/account.json</code>. Edit the JSON directly.</div>
          </div>
          <button className="btn-primary" onClick={saveAccount} disabled={savingAcc}>
            {savingAcc ? 'Saving…' : 'Save'}
          </button>
        </div>
        <textarea
          className="input min-h-[280px]"
          value={accountText}
          onChange={e => setAccountText(e.target.value)}
        />
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

import { useEffect, useState } from 'react'
import RunsPanel from '../components/RunsPanel'
import { api } from '../lib/api'

export default function TradingPalPage() {
  const [pool, setPool] = useState(null)
  const [text, setText] = useState('')
  const [groupsText, setGroupsText] = useState('{}')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.tradingCandidates().then(p => {
      setPool(p)
      setText((p.symbols || []).join(', '))
      setGroupsText(JSON.stringify(p.groups || {}, null, 2))
      setNotes(p.notes || '')
    }).catch(e => setErr(e.message))
  }, [])

  async function save() {
    setSaving(true); setErr(null); setMsg(null)
    try {
      const symbols = text.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      const uniqueSymbols = Array.from(new Set(symbols))
      let groups = {}
      try { groups = groupsText.trim() ? JSON.parse(groupsText) : {} }
      catch (e) { throw new Error('Groups must be valid JSON: ' + e.message) }
      await api.saveTradingCandidates({ symbols: uniqueSymbols, groups, notes })
      setPool({ symbols: uniqueSymbols, groups, notes })
      setMsg(`Saved ${uniqueSymbols.length} symbols.`)
      setTimeout(() => setMsg(null), 2500)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <RunsPanel moduleKey="trading_pal" triggerInputs={{ run_type: 'manual' }} />

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-semibold">Candidate Pool</div>
            <div className="text-xs text-slate-400">
              Symbols used for analysis. Edit and save — used by trading_pal scripts.
            </div>
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {msg && <div className="mb-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-2 border border-emerald-500/20">{msg}</div>}
        {err && <div className="mb-3 text-sm rounded-lg bg-rose-500/10 text-rose-200 px-3 py-2 border border-rose-500/20 break-words">{err}</div>}

        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Symbols (comma or space separated)</label>
        <textarea
          className="input min-h-[120px]"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="VOO, QQQ, AAPL, MSFT, ..."
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(pool?.symbols || []).map(s => (
            <span key={s} className="pill bg-ink-800 text-slate-200 border border-white/10">{s}</span>
          ))}
        </div>

        <label className="block text-xs uppercase tracking-wide text-slate-400 mt-4 mb-1">Groups (JSON)</label>
        <textarea
          className="input min-h-[120px]"
          value={groupsText}
          onChange={e => setGroupsText(e.target.value)}
        />

        <label className="block text-xs uppercase tracking-wide text-slate-400 mt-4 mb-1">Notes</label>
        <textarea
          className="input min-h-[60px]"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
    </div>
  )
}

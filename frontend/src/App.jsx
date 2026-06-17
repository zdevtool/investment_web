import { useEffect, useState } from 'react'
import TradingPalPage from './pages/TradingPalPage'
import OptionPalPage from './pages/OptionPalPage'
import HeartbeatPalPage from './pages/HeartbeatPalPage'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsSheet from './components/SettingsSheet'
import { api } from './lib/api'

const TABS = [
  { key: 'trading_pal', label: 'Trading', icon: '📈' },
  { key: 'option_pal', label: 'Options', icon: '🎯' },
  { key: 'heartbeat_pal', label: 'Heartbeat', icon: '💓' },
]

export default function App() {
  const [tab, setTab] = useState(() => localStorage.getItem('hub.tab') || 'trading_pal')
  const [health, setHealth] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { localStorage.setItem('hub.tab', tab) }, [tab])
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }))
  }, [])

  const healthLabel = !health
    ? 'Connecting…'
    : !health.ok
      ? 'Backend offline'
      : !health.github_configured
        ? 'GitHub token missing'
        : health.auth_required
          ? 'GitHub connected · auth required'
          : 'GitHub connected'

  const healthCls = !health ? 'text-slate-400'
    : !health.ok ? 'text-rose-300'
    : !health.github_configured ? 'text-amber-300'
    : 'text-emerald-300'

  return (
    <div className="min-h-full pb-24">
      <header className="sticky top-0 z-30 backdrop-blur bg-ink-950/85 border-b border-white/5">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 grid place-items-center shrink-0">📊</div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight">Investment Hub</div>
              <div className={`text-[11px] truncate ${healthCls}`}>{healthLabel}</div>
            </div>
          </div>
          <button className="btn-ghost text-xs" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙︎
          </button>
        </div>
      </header>

      <ErrorBoundary>
        <main className="mx-auto max-w-3xl px-3 sm:px-4 pt-4">
          {tab === 'trading_pal' && <TradingPalPage />}
          {tab === 'option_pal' && <OptionPalPage />}
          {tab === 'heartbeat_pal' && <HeartbeatPalPage />}
        </main>
      </ErrorBoundary>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-white/5 bg-ink-950/95 backdrop-blur"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-3xl grid grid-cols-3">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs transition ${
                  active ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
                <span className={`h-0.5 w-8 rounded-full ${active ? 'bg-emerald-400' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

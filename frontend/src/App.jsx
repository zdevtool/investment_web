import { useEffect, useState } from 'react'
import TradingPalPage from './pages/TradingPalPage'
import OptionPalPage from './pages/OptionPalPage'
import HeartbeatPalPage from './pages/HeartbeatPalPage'
import { api } from './lib/api'

const TABS = [
  { key: 'trading_pal', label: 'Trading', icon: '📈' },
  { key: 'option_pal', label: 'Options', icon: '🎯' },
  { key: 'heartbeat_pal', label: 'Heartbeat', icon: '💓' },
]

export default function App() {
  const [tab, setTab] = useState(() => {
    return localStorage.getItem('hub.tab') || 'trading_pal'
  })
  const [health, setHealth] = useState(null)

  useEffect(() => {
    localStorage.setItem('hub.tab', tab)
  }, [tab])

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }))
  }, [])

  return (
    <div className="min-h-full pb-24">
      <header className="sticky top-0 z-30 backdrop-blur bg-ink-950/85 border-b border-white/5">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 grid place-items-center">📊</div>
            <div>
              <div className="font-semibold leading-tight">Investment Hub</div>
              <div className="text-[11px] text-slate-400">
                {health
                  ? (health.github_configured ? 'GitHub connected' : 'GitHub token missing — set GITHUB_TOKEN')
                  : 'Connecting…'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 sm:px-4 pt-4">
        {tab === 'trading_pal' && <TradingPalPage />}
        {tab === 'option_pal' && <OptionPalPage />}
        {tab === 'heartbeat_pal' && <HeartbeatPalPage />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-white/5 bg-ink-950/95 backdrop-blur safe-area">
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
    </div>
  )
}

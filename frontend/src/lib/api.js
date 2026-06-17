const BASE = '/api'

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

export const api = {
  health: () => request('/health'),
  modules: () => request('/modules'),

  runs: (key) => request(`/modules/${key}/runs`),
  runsGrouped: (key) => request(`/modules/${key}/runs/grouped`),
  trigger: (key, body) =>
    request(`/modules/${key}/trigger`, { method: 'POST', body: JSON.stringify(body || {}) }),
  runLog: (key, runId, refresh = false) =>
    request(`/modules/${key}/runs/${runId}/log${refresh ? '?refresh=true' : ''}`),

  tradingCandidates: () => request('/trading_pal/candidates'),
  saveTradingCandidates: (body) =>
    request('/trading_pal/candidates', { method: 'PUT', body: JSON.stringify(body) }),

  optionPositions: () => request('/option_pal/positions'),
  saveOptionPositions: (positions) =>
    request('/option_pal/positions', { method: 'PUT', body: JSON.stringify({ positions }) }),
  optionAccount: () => request('/option_pal/account'),
  saveOptionAccount: (account) =>
    request('/option_pal/account', { method: 'PUT', body: JSON.stringify({ account }) }),

  heartbeatPredictions: () => request('/heartbeat_pal/predictions'),
  heartbeatPortfolio: () => request('/heartbeat_pal/portfolio'),
}

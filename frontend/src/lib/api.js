const BASE = '/api'
const TOKEN_KEY = 'hub.authToken'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const tok = getToken()
  if (tok) headers['X-Auth-Token'] = tok
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  health: () => request('/health'),
  modules: () => request('/modules'),
  overview: () => request('/overview'),

  runs: (key) => request(`/modules/${key}/runs`),
  runsGrouped: (key) => request(`/modules/${key}/runs/grouped`),
  trigger: (key, body) =>
    request(`/modules/${key}/trigger`, { method: 'POST', body: JSON.stringify(body || {}) }),
  cancelRun: (key, runId) =>
    request(`/modules/${key}/runs/${runId}/cancel`, { method: 'POST' }),
  runLog: (key, runId, refresh = false) =>
    request(`/modules/${key}/runs/${runId}/log${refresh ? '?refresh=true' : ''}`),
  runSummary: (key, runId) =>
    request(`/modules/${key}/runs/${runId}/summary`),
  runArtifacts: (key, runId) =>
    request(`/modules/${key}/runs/${runId}/artifacts`),
  artifactFileUrl: (key, runId, artifactId, fileName, { download = false } = {}) => {
    const tok = getToken()
    const params = new URLSearchParams()
    if (download) params.set('download', 'true')
    if (tok) params.set('token', tok)
    const qs = params.toString()
    const enc = fileName.split('/').map(encodeURIComponent).join('/')
    return `${BASE}/modules/${key}/runs/${runId}/artifacts/${artifactId}/files/${enc}${qs ? '?' + qs : ''}`
  },
  artifactFileText: async (key, runId, artifactId, fileName) => {
    const url = api.artifactFileUrl(key, runId, artifactId, fileName)
    const headers = {}
    const tok = getToken()
    if (tok) headers['X-Auth-Token'] = tok
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(t || res.statusText)
    }
    return await res.text()
  },

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
  saveHeartbeatPortfolio: (portfolio) =>
    request('/heartbeat_pal/portfolio', { method: 'PUT', body: JSON.stringify({ portfolio }) }),
}

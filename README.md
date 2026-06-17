# Investment Hub

A lightweight, mobile-first dashboard that ties together the three
investment-bot projects in this monorepo:

| Module | Project folder | Purpose |
|---|---|---|
| 📈 **Trading Pal** | `trading_pal/` | Regime-aware multi-factor swing trading engine |
| 🎯 **Option Pal**  | `option_pal/`  | Conservative options selling assistant |
| 💓 **Heartbeat Pal** | `heartbeat_pal/` | Eruption (breakout) scanner |

For each module the UI lets you:

1. See the most recent GitHub Actions run (status + log + **structured summary**).
2. **Trigger** the workflow manually with one tap. Page auto-polls until the
   new run shows up and finishes.
3. **Cancel** an in-progress workflow.
4. Browse historic runs **grouped by date** (cached on the backend).
5. View / edit the data the project consumes:
   - Trading Pal: candidate-pool symbols & groups (live-loaded by `trading_pal`)
   - Option Pal:  option holdings + portfolio/account JSON
   - Heartbeat Pal: predictions snapshot + portfolio (read-only)
6. Install as a **PWA** on iPhone home screen — fullscreen, dark, native feel.

Single user, no DB. Optional shared-token auth to safely expose beyond
localhost. State lives on disk under `web/data/` and in the existing project
folders (`option_pal/positions.json`, `option_pal/account.json`).

---

## Architecture

```
web/
├── backend/         FastAPI service (port 8787)
│   ├── app/
│   │   ├── main.py        - app + CORS + auth middleware
│   │   ├── config.py      - settings + module registry
│   │   ├── github.py      - dispatch / list / cancel / logs
│   │   ├── log_parser.py  - parse logs into structured summaries
│   │   ├── storage.py     - JSON helpers + run cache
│   │   └── routes.py      - HTTP endpoints
│   └── tests/             - pytest smoke tests
├── frontend/        React + Vite + Tailwind (port 5173)
│   ├── public/
│   │   ├── icon.svg               - PWA icon
│   │   └── manifest.webmanifest
│   └── src/
│       ├── App.jsx                - tab shell + settings drawer
│       ├── components/
│       │   ├── RunsPanel.jsx      - live status, polling, summary
│       │   ├── ErrorBoundary.jsx  - crash isolation
│       │   └── SettingsSheet.jsx  - token + diagnostics
│       ├── pages/                 - one page per module
│       └── lib/api.js             - fetch + token plumbing
└── data/            backend state (JSON files)
    ├── trading_pal_candidates.json   - candidate pool (editable in UI)
    └── runs/<module>/<YYYY-MM-DD>/   - cached run snapshots
```

The Vite dev server proxies `/api/*` → `http://localhost:8787` so the
frontend has no CORS issues during development.

---

## Setup

### 1. Backend env

```bash
cd web/backend
cp .env.example .env
```

Edit `.env`:

```ini
GITHUB_TOKEN=ghp_xxx   # PAT with "Actions: read & write" scope
GITHUB_OWNER=your_gh_handle_or_org

# Repo names match the existing remotes (see each project's .git/config).
TRADING_PAL_REPO=trading_pal
TRADING_PAL_WORKFLOW=trading.yml
OPTION_PAL_REPO=option_pay
OPTION_PAL_WORKFLOW=options_scanner.yml
HEARTBEAT_PAL_REPO=heartbeat_pal
HEARTBEAT_PAL_WORKFLOW=scan.yml

CORS_ALLOW_ORIGIN=*

# Optional: gate the API behind a shared secret. Frontend stores it
# in localStorage and sends `X-Auth-Token` on every request.
AUTH_TOKEN=
```

> Token: a fine-grained PAT scoped to the three repos with **Actions:
> read & write** + **Contents: read** is enough.

### 2. Run the backend

```bash
./web/run-backend.sh
# → http://localhost:8787/api/health
```

It creates `.venv` on first run and installs `fastapi`, `uvicorn`, `httpx`,
`pytest`.

### 3. Run the frontend

```bash
./web/run-frontend.sh
# → http://localhost:5173
```

On first run it executes `npm install`. Requires Node 18+.

### Tests

```bash
cd web/backend
source .venv/bin/activate
pytest tests/ -q
```

Eight smoke tests cover health, modules, candidate-pool round-trip, and
the three log parsers. They run in <1 s with no network access.

### Use it on your phone

While both servers run, open `http://<your-mac-lan-ip>:5173` from your
phone.

- iOS Safari → Share → **"Add to Home Screen"** → tap the new "Hub" icon.
  Manifest + apple-touch-icon are wired so it launches fullscreen with
  the dark theme baked in.

---

## How the GitHub trigger works

We call the
[`POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches`](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
endpoint. After dispatch the UI **auto-polls** every ~4 s until the new
run id appears, then every ~8 s until it leaves `in_progress`.

Default `inputs` per module:

| Module | inputs |
|---|---|
| trading_pal  | `{run_type: "manual"}` |
| option_pal   | `{skip_market_check: "true"}` |
| heartbeat_pal | none |

In-progress runs show a pulsing "live" pill and a **Cancel** button
(POST → `/actions/runs/{id}/cancel`).

---

## Run-history cache + structured summaries

Every refresh, the backend pulls the latest 50 runs from GitHub and
writes one JSON snapshot per run under
`web/data/runs/<module>/<YYYY-MM-DD>/run_<id>.json`. Run logs are zipped
by GitHub — we unzip them, concatenate the per-job text files, and keep
the last 200 KB. The grouped view reads from disk so historical
browsing is offline-friendly and free of API rate limits.

When you open a run, the **Summary card** parses that text into:

- Trading Pal → detected `regime`, `BUY/SELL/HOLD <SYMBOL>` orders, errors
- Option Pal → counts of call / put recommendations, close alerts, rolls
- Heartbeat Pal → pool size, tier counts (CRITICAL / HIGH / MEDIUM), top alerts

The parsers are best-effort regex; they degrade gracefully when log
formats change.

---

## Editable data files

| UI surface | Underlying file |
|---|---|
| Trading Pal → Candidate Pool | `web/data/trading_pal_candidates.json` |
| Option Pal → Option Holdings | `option_pal/positions.json` |
| Option Pal → Account / Portfolio | `option_pal/account.json` |
| Heartbeat Pal → Predictions / Portfolio | read-only view of `heartbeat_pal/predictions.json` & `portfolio.json` |

### Trading Pal candidate-pool wiring

[`trading_pal/core/config.py`](../trading_pal/trading_pal/core/config.py)
loads `web/data/trading_pal_candidates.json` automatically (or whatever
path is in env `TRADING_PAL_CANDIDATE_FILE`). Its `symbols` override
`FULL_UNIVERSE`; its `groups` are merged on top of the built-in
`SYMBOL_GROUPS`. Edit in the UI, save, and the next `python run.py`
picks it up — no code changes, no restarts.

The file is JSON, e.g.:

```json
{
  "symbols": ["VOO", "QQQ", "AAPL", "..."],
  "groups": { "mag7": ["AAPL", "MSFT", ...] },
  "notes": "..."
}
```

---

## Optional auth (`AUTH_TOKEN`)

If you set `AUTH_TOKEN=somesecret` in `web/backend/.env`, every
non-public endpoint requires `X-Auth-Token: somesecret`. Open the ⚙︎
settings drawer in the UI, paste your token, hit **Save** — it's stored
in `localStorage` and sent automatically. `GET /api/health` is always
public so the UI can detect whether auth is required.

This is enough to safely run behind Tailscale or a reverse proxy
without exposing your GitHub PAT.

---

## Production notes (later)

- Build the SPA with `npm run build` and serve `dist/` from any static
  host. Point it at a deployed FastAPI instance.
- For "always-on" triggering without keeping your laptop open, keep the
  existing **cron-job.org → GitHub workflow_dispatch** path. The web UI
  is a convenience layer, not a scheduler.
- The PWA manifest already targets standalone display — wrap it in a
  service worker later if you want offline read-only access.

---

## Tech stack

- Backend: Python 3.9+ · FastAPI · httpx · uvicorn · pytest
- Frontend: React 18 · Vite 5 · Tailwind 3 (dark, mobile-first, PWA)
- Storage: plain JSON files (no DB)

Keep it simple, keep it boring, keep it yours.

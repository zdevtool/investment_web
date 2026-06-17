# Investment Hub

A lightweight, mobile-friendly dashboard that ties together the three
investment-bot projects in this monorepo:

| Module | Project folder | Purpose |
|---|---|---|
| 📈 **Trading Pal** | `trading_pal/` | Regime-aware multi-factor swing trading engine |
| 🎯 **Option Pal**  | `option_pal/`  | Conservative options selling assistant |
| 💓 **Heartbeat Pal** | `heartbeat_pal/` | Eruption (breakout) scanner |

For each module the UI lets you:

1. See the most recent GitHub Actions run (status + log).
2. **Trigger** the workflow manually with one tap.
3. Browse historic runs **grouped by date** (cached on the backend).
4. View / edit the data the project consumes:
   - Trading Pal: candidate-pool symbols & groups
   - Option Pal:  option holdings + portfolio/account JSON
   - Heartbeat Pal: predictions snapshot + portfolio (read-only)

Single user, no auth, no DB. State lives on disk under `web/data/` and in
the existing project folders (`option_pal/positions.json`,
`option_pal/account.json`).

---

## Architecture

```
web/
├── backend/         FastAPI service (port 8787)
│   └── app/
│       ├── main.py        - FastAPI app + CORS
│       ├── config.py      - settings + module registry
│       ├── github.py      - GitHub Actions REST helpers
│       ├── storage.py     - JSON helpers + run cache
│       └── routes.py      - HTTP endpoints
├── frontend/        React + Vite + Tailwind (port 5173)
│   └── src/
│       ├── App.jsx              - tab shell
│       ├── components/RunsPanel - shared runs UI
│       ├── pages/               - one page per module
│       └── lib/api.js           - thin fetch wrapper
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
```

> Token: a fine-grained PAT scoped to the three repos with **Actions:
> read & write** + **Contents: read** is enough.

### 2. Run the backend

```bash
./web/run-backend.sh
# → http://localhost:8787/api/health
```

It creates `.venv` on first run and installs `fastapi`, `uvicorn`, `httpx`.

### 3. Run the frontend

```bash
./web/run-frontend.sh
# → http://localhost:5173
```

On first run it executes `npm install`. Requires Node 18+.

### Open on your phone

While both servers run, point your phone to
`http://<your-mac-lan-ip>:5173`. The UI is mobile-first; nav bar and
modals are touch-sized and respect safe-area insets.

---

## How the GitHub trigger works

We call the
[`POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches`](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
endpoint. Default `inputs` per module:

| Module | inputs |
|---|---|
| trading_pal  | `{run_type: "manual"}` |
| option_pal   | `{skip_market_check: "true"}` |
| heartbeat_pal | none |

You can extend inputs via the trigger button by passing
`{ inputs: {...} }` from the UI (currently hard-coded sensible defaults).

---

## Run-history cache

When the UI hits **Refresh**, the backend pulls the latest 50 runs from
the GitHub API and writes one JSON file per run under
`web/data/runs/<module>/<YYYY-MM-DD>/run_<id>.json`. The grouped view
reads those snapshots so historical browsing is offline-friendly and
free of API rate limits. Hit "Log" on a run to download and cache the
zipped logs (last 200 KB are kept).

---

## Editable data files

| UI surface | Underlying file |
|---|---|
| Trading Pal → Candidate Pool | `web/data/trading_pal_candidates.json` |
| Option Pal → Option Holdings | `option_pal/positions.json` |
| Option Pal → Account / Portfolio | `option_pal/account.json` |
| Heartbeat Pal → Predictions / Portfolio | read-only views of `heartbeat_pal/predictions.json` & `portfolio.json` |

For Trading Pal the candidate pool lives inside `web/data/` and is *not*
yet wired into `trading_pal`'s code path. To use it on the next run,
read `web/data/trading_pal_candidates.json` from `trading_pal`'s engine,
or commit it back into the repo through your usual flow. The file is
JSON, e.g.:

```json
{
  "symbols": ["VOO", "QQQ", "AAPL", "..."],
  "groups": { "mag7": ["AAPL", "MSFT", ...] },
  "notes": "..."
}
```

---

## Production notes (later)

- Build the SPA with `npm run build` and serve `dist/` from any static
  host. Point it at a deployed FastAPI instance.
- For "always-on" triggering without keeping your laptop open, keep the
  existing **cron-job.org → GitHub workflow_dispatch** path. The web UI
  is a convenience layer, not a scheduler.
- Single-user assumption ⇒ no auth. If you ever expose this beyond
  localhost, put it behind Tailscale or add a token-gate in
  `app/main.py`.

---

## Tech stack

- Backend: Python 3.11 · FastAPI · httpx · uvicorn
- Frontend: React 18 · Vite 5 · Tailwind 3
- Storage: plain JSON files (no DB)

Keep it simple, keep it boring, keep it yours.

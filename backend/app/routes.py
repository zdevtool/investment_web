from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from .config import Settings, get_settings
from . import github as gh
from .log_parser import summarize as summarize_log
from .storage import (
    append_run_record,
    extract_log_text_from_zip,
    get_local_run,
    list_local_runs,
    read_json,
    write_json,
)


router = APIRouter()


def _module(settings: Settings, key: str):
    if key not in settings.modules:
        raise HTTPException(status_code=404, detail=f"Unknown module: {key}")
    return settings.modules[key]


# ---------- Modules listing ----------
@router.get("/modules")
def list_modules(settings: Settings = Depends(get_settings)) -> list[dict]:
    return [
        {
            "key": m.key,
            "name": m.name,
            "repo": m.repo,
            "workflow": m.workflow,
        }
        for m in settings.modules.values()
    ]


# ---------- Workflow runs (live + cached) ----------
@router.get("/modules/{key}/runs")
async def get_runs(key: str, settings: Settings = Depends(get_settings)):
    """Fetch latest runs from GitHub and refresh the local cache."""
    module = _module(settings, key)
    runs = await gh.list_workflow_runs(settings, module, per_page=50)
    for r in runs:
        append_run_record(settings.runs_dir, key, r, log_text=None)
    return {"runs": runs}


@router.get("/modules/{key}/runs/grouped")
def get_runs_grouped(key: str, settings: Settings = Depends(get_settings)):
    """Return locally-cached runs grouped by date (descending)."""
    _module(settings, key)
    return {"by_date": list_local_runs(settings.runs_dir, key)}


@router.post("/modules/{key}/trigger")
async def trigger_run(
    key: str,
    body: Optional[dict] = Body(default=None),
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, key)
    inputs = (body or {}).get("inputs") if body else None
    ref = (body or {}).get("ref", "main") if body else "main"
    return await gh.trigger_workflow(settings, module, inputs=inputs, ref=ref)


@router.get("/modules/{key}/runs/{run_id}/log")
async def get_run_log(
    key: str,
    run_id: int,
    refresh: bool = False,
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, key)

    if not refresh:
        cached = get_local_run(settings.runs_dir, key, run_id)
        if cached and cached.get("log_excerpt"):
            return {"run": cached.get("meta"), "log": cached["log_excerpt"], "cached": True}

    runs = await gh.list_workflow_runs(settings, module, per_page=100)
    meta = next((r for r in runs if int(r.get("id", 0)) == int(run_id)), None)
    if not meta:
        raise HTTPException(status_code=404, detail="Run not found in recent history")

    try:
        log_bytes = await gh.get_run_logs(settings, module, run_id)
        log_text = extract_log_text_from_zip(log_bytes)
    except HTTPException as e:
        log_text = f"(log unavailable: {e.detail})"

    append_run_record(settings.runs_dir, key, meta, log_text=log_text)
    return {"run": meta, "log": log_text, "cached": False}


@router.get("/modules/{key}/runs/{run_id}/summary")
async def get_run_summary(
    key: str,
    run_id: int,
    settings: Settings = Depends(get_settings),
):
    """Return a structured per-module summary parsed from the run log."""
    module = _module(settings, key)
    cached = get_local_run(settings.runs_dir, key, run_id)
    log_text = (cached or {}).get("log_excerpt") if cached else None
    if not log_text:
        try:
            log_bytes = await gh.get_run_logs(settings, module, run_id)
            log_text = extract_log_text_from_zip(log_bytes)
            runs = await gh.list_workflow_runs(settings, module, per_page=100)
            meta = next((r for r in runs if int(r.get("id", 0)) == int(run_id)), None)
            if meta:
                append_run_record(settings.runs_dir, key, meta, log_text=log_text)
        except HTTPException as e:
            return {"run_id": run_id, "summary": {"available": False, "error": str(e.detail)}}
    summary = summarize_log(key, log_text)
    return {"run_id": run_id, "summary": summary}


@router.post("/modules/{key}/runs/{run_id}/cancel")
async def cancel_run_endpoint(
    key: str,
    run_id: int,
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, key)
    return await gh.cancel_run(settings, module, run_id)


# ---------- Trading Pal: candidate pool ----------
class CandidatePool(BaseModel):
    symbols: list[str] = []
    groups: dict[str, list[str]] = {}
    notes: str = ""


@router.get("/trading_pal/candidates")
def get_trading_candidates(settings: Settings = Depends(get_settings)) -> dict:
    path = settings.data_dir / "trading_pal_candidates.json"
    default = {
        "symbols": [
            "VOO", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META",
            "TSLA", "AMD", "AVGO", "JPM", "GS", "V", "XOM", "CVX",
        ],
        "groups": {
            "core": ["VOO", "QQQ"],
            "mag7": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"],
        },
        "notes": "Candidate pool used by trading_pal. Edit and save to update.",
    }
    return read_json(path, default)


@router.put("/trading_pal/candidates")
def put_trading_candidates(
    body: CandidatePool,
    settings: Settings = Depends(get_settings),
) -> dict:
    path = settings.data_dir / "trading_pal_candidates.json"
    write_json(path, body.model_dump())
    return {"ok": True}


# ---------- Option Pal: positions + account ----------
@router.get("/option_pal/positions")
def get_option_positions(settings: Settings = Depends(get_settings)):
    module = _module(settings, "option_pal")
    path = module.project_dir / "positions.json"
    return {"positions": read_json(path, [])}


@router.put("/option_pal/positions")
def put_option_positions(
    body: dict,
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, "option_pal")
    positions = body.get("positions") if isinstance(body, dict) else None
    if positions is None or not isinstance(positions, list):
        raise HTTPException(status_code=400, detail="Body must be {positions: [...]}")
    path = module.project_dir / "positions.json"
    write_json(path, positions)
    return {"ok": True}


@router.get("/option_pal/account")
def get_option_account(settings: Settings = Depends(get_settings)):
    module = _module(settings, "option_pal")
    path = module.project_dir / "account.json"
    fallback = read_json(module.project_dir / "account.example.json", {})
    return {"account": read_json(path, fallback)}


@router.put("/option_pal/account")
def put_option_account(
    body: dict,
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, "option_pal")
    account = body.get("account") if isinstance(body, dict) else None
    if not isinstance(account, dict):
        raise HTTPException(status_code=400, detail="Body must be {account: {...}}")
    path = module.project_dir / "account.json"
    write_json(path, account)
    return {"ok": True}


# ---------- Heartbeat Pal: alert history (read-only) ----------
@router.get("/heartbeat_pal/predictions")
def get_heartbeat_predictions(settings: Settings = Depends(get_settings)):
    module = _module(settings, "heartbeat_pal")
    path = module.project_dir / "predictions.json"
    return {"predictions": read_json(path, [])}


@router.get("/heartbeat_pal/portfolio")
def get_heartbeat_portfolio(settings: Settings = Depends(get_settings)):
    module = _module(settings, "heartbeat_pal")
    path = module.project_dir / "portfolio.json"
    return {"portfolio": read_json(path, {})}


# ---------- Health ----------
@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return {
        "ok": True,
        "github_configured": bool(settings.github_token),
        "auth_required": bool(settings.auth_token),
        "modules": list(settings.modules.keys()),
    }

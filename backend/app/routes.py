from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .config import Settings, get_settings
from . import github as gh
from .log_parser import summarize as summarize_log
from .storage import (
    append_run_record,
    extract_log_text_from_zip,
    get_local_run,
    list_artifact_files,
    list_local_runs,
    read_artifact_file,
    read_json,
    write_json,
)


router = APIRouter()

_ARTIFACT_CACHE: dict[tuple[str, int], tuple[float, bytes]] = {}
_ARTIFACT_CACHE_TTL = 300.0  # seconds


async def _get_artifact_zip(settings: Settings, module, artifact_id: int) -> bytes:
    cache_key = (module.key, int(artifact_id))
    now = time.time()
    cached = _ARTIFACT_CACHE.get(cache_key)
    if cached and (now - cached[0] < _ARTIFACT_CACHE_TTL):
        return cached[1]
    blob = await gh.download_artifact_zip(settings, module, artifact_id)
    _ARTIFACT_CACHE[cache_key] = (now, blob)
    if len(_ARTIFACT_CACHE) > 32:
        oldest = sorted(_ARTIFACT_CACHE.items(), key=lambda kv: kv[1][0])[:-32]
        for k, _ in oldest:
            _ARTIFACT_CACHE.pop(k, None)
    return blob


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


# ---------- Run artifacts (script-generated reports) ----------
@router.get("/modules/{key}/runs/{run_id}/artifacts")
async def list_artifacts(
    key: str,
    run_id: int,
    settings: Settings = Depends(get_settings),
):
    """List artifacts attached to a workflow run, with file-level breakdown."""
    module = _module(settings, key)
    artifacts = await gh.list_run_artifacts(settings, module, run_id)
    enriched: list[dict] = []
    for a in artifacts:
        files: list[dict] = []
        if not a.get("expired"):
            try:
                blob = await _get_artifact_zip(settings, module, a["id"])
                files = list_artifact_files(blob)
            except HTTPException as e:
                files = []
                a["error"] = str(e.detail)
        enriched.append({**a, "files": files})
    return {"run_id": run_id, "artifacts": enriched}


@router.get("/modules/{key}/runs/{run_id}/artifacts/{artifact_id}/files/{file_path:path}")
async def read_artifact(
    key: str,
    run_id: int,
    artifact_id: int,
    file_path: str,
    download: bool = False,
    settings: Settings = Depends(get_settings),
):
    """Stream a single file out of an artifact zip.

    `download=true` forces an attachment Content-Disposition; otherwise
    text/html/json/image content is returned inline so the browser can
    render it.
    """
    module = _module(settings, key)
    blob = await _get_artifact_zip(settings, module, artifact_id)
    try:
        raw, kind = read_artifact_file(blob, file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not in artifact: {file_path}")

    media_map = {
        "html": "text/html; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "text": "text/plain; charset=utf-8",
        "image": _image_mime(file_path),
        "binary": "application/octet-stream",
    }
    media = media_map.get(kind, "application/octet-stream")
    headers: dict[str, str] = {}
    if download or kind == "binary":
        leaf = file_path.rsplit("/", 1)[-1]
        headers["Content-Disposition"] = f'attachment; filename="{leaf}"'
    return Response(content=raw, media_type=media, headers=headers)


def _image_mime(name: str) -> str:
    n = name.lower()
    if n.endswith(".png"):
        return "image/png"
    if n.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if n.endswith(".gif"):
        return "image/gif"
    if n.endswith(".svg"):
        return "image/svg+xml"
    if n.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


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


# ---------- Heartbeat Pal: alert history + portfolio ----------
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


@router.put("/heartbeat_pal/portfolio")
def put_heartbeat_portfolio(
    body: dict,
    settings: Settings = Depends(get_settings),
):
    module = _module(settings, "heartbeat_pal")
    portfolio = body.get("portfolio") if isinstance(body, dict) else None
    if not isinstance(portfolio, dict):
        raise HTTPException(status_code=400, detail="Body must be {portfolio: {...}}")
    path = module.project_dir / "portfolio.json"
    write_json(path, portfolio)
    return {"ok": True}


# ---------- Overview: aggregated dashboard ----------
@router.get("/overview")
async def overview(settings: Settings = Depends(get_settings)) -> dict:
    """Aggregate snapshot across all modules for a single-view dashboard."""
    out: dict[str, Any] = {"modules": []}
    for key, module in settings.modules.items():
        latest = None
        live = False
        error = None
        try:
            if settings.github_token:
                runs = await gh.list_workflow_runs(settings, module, per_page=5)
                for r in runs:
                    append_run_record(settings.runs_dir, key, r, log_text=None)
                if runs:
                    latest = runs[0]
                    live = latest.get("status") in ("in_progress", "queued")
        except HTTPException as e:
            error = str(e.detail)
        except Exception as e:  # pragma: no cover - defensive
            error = f"{type(e).__name__}: {e}"

        if latest is None:
            grouped = list_local_runs(settings.runs_dir, key)
            for date_items in grouped.values():
                if date_items:
                    latest = date_items[0]
                    break

        extra: dict[str, Any] = {}
        if key == "trading_pal":
            pool = read_json(settings.data_dir / "trading_pal_candidates.json", {})
            extra["candidate_count"] = len(pool.get("symbols", []) or [])
        elif key == "option_pal":
            positions = read_json(module.project_dir / "positions.json", [])
            extra["open_positions"] = len(positions) if isinstance(positions, list) else 0
        elif key == "heartbeat_pal":
            portfolio = read_json(module.project_dir / "portfolio.json", {})
            positions = (portfolio or {}).get("positions") or []
            extra["open_positions"] = len([p for p in positions if (p or {}).get("status") == "open"])

        out["modules"].append({
            "key": key,
            "name": module.name,
            "repo": module.repo,
            "workflow": module.workflow,
            "latest": latest,
            "live": live,
            "error": error,
            **extra,
        })
    out["github_configured"] = bool(settings.github_token)
    return out


# ---------- Health ----------
@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    return {
        "ok": True,
        "github_configured": bool(settings.github_token),
        "auth_required": bool(settings.auth_token),
        "modules": list(settings.modules.keys()),
    }

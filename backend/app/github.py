from __future__ import annotations

import httpx
from fastapi import HTTPException

from .config import ModuleConfig, Settings


GITHUB_API = "https://api.github.com"


def _headers(settings: Settings) -> dict:
    if not settings.github_token:
        raise HTTPException(
            status_code=400,
            detail="GITHUB_TOKEN is not configured on the backend. "
                   "Set it in web/backend/.env to enable GitHub integration.",
        )
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {settings.github_token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def trigger_workflow(
    settings: Settings,
    module: ModuleConfig,
    inputs: dict | None = None,
    ref: str = "main",
) -> dict:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/workflows/{module.workflow}/dispatches"
    )
    payload = {"ref": ref}
    if inputs:
        payload["inputs"] = inputs
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=_headers(settings), json=payload)
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub dispatch failed: {resp.text}",
        )
    return {"ok": True, "ref": ref, "inputs": inputs or {}}


async def list_workflow_runs(
    settings: Settings,
    module: ModuleConfig,
    per_page: int = 30,
) -> list[dict]:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/workflows/{module.workflow}/runs"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            headers=_headers(settings),
            params={"per_page": per_page},
        )
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub list runs failed: {resp.text}",
        )
    data = resp.json()
    runs = data.get("workflow_runs", [])
    return [
        {
            "id": r["id"],
            "status": r["status"],
            "conclusion": r["conclusion"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "html_url": r["html_url"],
            "event": r["event"],
            "run_number": r["run_number"],
            "name": r["name"],
            "head_branch": r["head_branch"],
            "head_sha": r["head_sha"],
            "actor": (r.get("actor") or {}).get("login"),
        }
        for r in runs
    ]


async def get_run_logs(
    settings: Settings,
    module: ModuleConfig,
    run_id: int,
) -> bytes:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/runs/{run_id}/logs"
    )
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=_headers(settings))
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub logs failed: {resp.text[:200]}",
        )
    return resp.content


async def get_run_jobs(
    settings: Settings,
    module: ModuleConfig,
    run_id: int,
) -> list[dict]:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/runs/{run_id}/jobs"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=_headers(settings))
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub jobs failed: {resp.text}",
        )
    return resp.json().get("jobs", [])


async def cancel_run(
    settings: Settings,
    module: ModuleConfig,
    run_id: int,
) -> dict:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/runs/{run_id}/cancel"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=_headers(settings))
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub cancel failed: {resp.text}",
        )
    return {"ok": True, "run_id": run_id}


async def list_run_artifacts(
    settings: Settings,
    module: ModuleConfig,
    run_id: int,
) -> list[dict]:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/runs/{run_id}/artifacts"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=_headers(settings))
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub list artifacts failed: {resp.text[:200]}",
        )
    data = resp.json()
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "size_in_bytes": a.get("size_in_bytes"),
            "expired": a.get("expired", False),
            "created_at": a.get("created_at"),
            "expires_at": a.get("expires_at"),
        }
        for a in data.get("artifacts", [])
    ]


async def download_artifact_zip(
    settings: Settings,
    module: ModuleConfig,
    artifact_id: int,
) -> bytes:
    url = (
        f"{GITHUB_API}/repos/{settings.github_owner}/{module.repo}"
        f"/actions/artifacts/{artifact_id}/zip"
    )
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=_headers(settings))
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"GitHub artifact download failed: {resp.text[:200]}",
        )
    return resp.content

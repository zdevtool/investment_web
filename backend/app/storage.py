from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def append_run_record(
    runs_dir: Path,
    module_key: str,
    run_meta: dict,
    log_text: str | None = None,
) -> Path:
    """Save a run snapshot to disk grouped by date."""
    created_at = run_meta.get("created_at") or datetime.utcnow().isoformat() + "Z"
    try:
        date_part = created_at.split("T")[0]
    except Exception:
        date_part = datetime.utcnow().strftime("%Y-%m-%d")

    target_dir = runs_dir / module_key / date_part
    target_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "meta": run_meta,
        "saved_at": datetime.utcnow().isoformat() + "Z",
        "log_excerpt": (log_text or "")[-20000:] if log_text else None,
    }
    fname = f"run_{run_meta.get('id')}.json"
    out_path = target_dir / fname
    write_json(out_path, record)
    return out_path


def list_local_runs(runs_dir: Path, module_key: str) -> dict[str, list[dict]]:
    """Group local cached run records by date (descending)."""
    base = runs_dir / module_key
    grouped: dict[str, list[dict]] = {}
    if not base.exists():
        return grouped
    for date_dir in sorted(base.iterdir(), reverse=True):
        if not date_dir.is_dir():
            continue
        items = []
        for run_file in sorted(date_dir.glob("run_*.json"), reverse=True):
            data = read_json(run_file, {})
            if isinstance(data, dict):
                meta = data.get("meta") or {}
                items.append({
                    "id": meta.get("id"),
                    "status": meta.get("status"),
                    "conclusion": meta.get("conclusion"),
                    "created_at": meta.get("created_at"),
                    "html_url": meta.get("html_url"),
                    "run_number": meta.get("run_number"),
                    "event": meta.get("event"),
                    "has_log": bool(data.get("log_excerpt")),
                })
        if items:
            grouped[date_dir.name] = items
    return grouped


def get_local_run(runs_dir: Path, module_key: str, run_id: int) -> dict | None:
    base = runs_dir / module_key
    if not base.exists():
        return None
    for f in base.glob(f"*/run_{run_id}.json"):
        return read_json(f, None)
    return None


def extract_log_text_from_zip(zip_bytes: bytes, max_chars: int = 200_000) -> str:
    """GitHub returns a zip of per-job log files. Concatenate them readably."""
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            chunks: list[str] = []
            for name in zf.namelist():
                if not name.endswith(".txt"):
                    continue
                try:
                    body = zf.read(name).decode("utf-8", errors="replace")
                except Exception:
                    continue
                chunks.append(f"\n===== {name} =====\n{body}")
            text = "".join(chunks)
            if len(text) > max_chars:
                text = text[-max_chars:]
            return text
    except zipfile.BadZipFile:
        return zip_bytes.decode("utf-8", errors="replace")[:max_chars]

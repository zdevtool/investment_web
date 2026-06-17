import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Force a fresh, isolated working dir for tests
os.environ.setdefault("GITHUB_TOKEN", "test-token")
os.environ.setdefault("GITHUB_OWNER", "tester")
os.environ.setdefault("AUTH_TOKEN", "")  # disabled by default in tests

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.config import get_settings  # noqa: E402
from app import log_parser  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "data_dir", tmp_path)
    monkeypatch.setattr(s, "runs_dir", tmp_path / "runs")
    s.runs_dir.mkdir(parents=True, exist_ok=True)
    for k in s.modules:
        (s.runs_dir / k).mkdir(parents=True, exist_ok=True)
    return TestClient(app)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "trading_pal" in body["modules"]


def test_modules(client):
    r = client.get("/api/modules")
    assert r.status_code == 200
    keys = {m["key"] for m in r.json()}
    assert keys == {"trading_pal", "option_pal", "heartbeat_pal"}


def test_runs_grouped_empty(client):
    r = client.get("/api/modules/trading_pal/runs/grouped")
    assert r.status_code == 200
    assert "by_date" in r.json()


def test_trading_candidates_roundtrip(client):
    r = client.get("/api/trading_pal/candidates")
    assert r.status_code == 200
    pool = r.json()
    assert "symbols" in pool

    new_pool = {"symbols": ["AAA", "BBB"], "groups": {"x": ["AAA"]}, "notes": "t"}
    r2 = client.put("/api/trading_pal/candidates", json=new_pool)
    assert r2.status_code == 200

    r3 = client.get("/api/trading_pal/candidates")
    assert r3.json()["symbols"] == ["AAA", "BBB"]


def test_log_parser_trading():
    log = """
INFO regime=NORMAL
SUGGEST: BUY NVDA shares: 5
HOLD AAPL
========== summary ==========
"""
    s = log_parser.summarize("trading_pal", log)
    assert s["available"] is True
    assert s["regime"] == "NORMAL"
    assert any(o["symbol"] == "NVDA" for o in s["orders"])


def test_log_parser_option():
    log = "Found 3 covered call recommendations\nput recommendation: AAPL\nbuy to close NVDA\n"
    s = log_parser.summarize("option_pal", log)
    assert s["metrics"]["calls"] >= 1
    assert s["metrics"]["puts"] >= 1
    assert s["metrics"]["close_alerts"] >= 1


def test_log_parser_heartbeat():
    log = "Pool size: 100\nCRITICAL TSLA score=85\nHIGH NVDA score=60\nMEDIUM AAPL score=40\n"
    s = log_parser.summarize("heartbeat_pal", log)
    assert s["pool_size"] == 100
    assert s["tiers"]["CRITICAL"] >= 1
    assert any(t["symbol"] == "TSLA" for t in s["top"])


def test_extract_log_text_from_zip():
    import io, zipfile
    from app.storage import extract_log_text_from_zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("0_setup.txt", "hello world")
        zf.writestr("1_run.txt", "line 1\nline 2")
    text = extract_log_text_from_zip(buf.getvalue())
    assert "hello world" in text and "line 2" in text


def test_overview_offline(client, monkeypatch):
    """Without a real GitHub token reachable, /overview should still return a
    structured payload (per-module error captured, latest=None or cached)."""
    s = get_settings()
    monkeypatch.setattr(s, "github_token", "")
    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["github_configured"] is False
    keys = {m["key"] for m in body["modules"]}
    assert keys == {"trading_pal", "option_pal", "heartbeat_pal"}
    for m in body["modules"]:
        assert "candidate_count" in m or "open_positions" in m


def test_heartbeat_portfolio_roundtrip(client, tmp_path, monkeypatch):
    s = get_settings()
    fake_proj = tmp_path / "heartbeat_proj"
    fake_proj.mkdir()
    monkeypatch.setattr(s.modules["heartbeat_pal"], "project_dir", fake_proj)
    payload = {"portfolio": {"account": {"current_capital": 1000}, "positions": []}}
    r = client.put("/api/heartbeat_pal/portfolio", json=payload)
    assert r.status_code == 200
    saved = json.loads((fake_proj / "portfolio.json").read_text())
    assert saved["account"]["current_capital"] == 1000
    r2 = client.get("/api/heartbeat_pal/portfolio")
    assert r2.json()["portfolio"]["account"]["current_capital"] == 1000


def test_heartbeat_portfolio_bad_body(client):
    r = client.put("/api/heartbeat_pal/portfolio", json={"wrong": 1})
    assert r.status_code == 400


def test_auth_required_when_token_set(tmp_path, monkeypatch):
    """When AUTH_TOKEN is configured, calls without the header are 401."""
    s = get_settings()
    monkeypatch.setattr(s, "auth_token", "secret123")
    monkeypatch.setattr(s, "data_dir", tmp_path)
    monkeypatch.setattr(s, "runs_dir", tmp_path / "runs")
    s.runs_dir.mkdir(parents=True, exist_ok=True)
    c = TestClient(app)
    # /health is public
    assert c.get("/api/health").status_code == 200
    # other endpoints require token
    r = c.get("/api/modules")
    assert r.status_code == 401
    r2 = c.get("/api/modules", headers={"X-Auth-Token": "secret123"})
    assert r2.status_code == 200

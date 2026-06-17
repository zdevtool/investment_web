"""
Lightweight log parsers — extract a structured summary from raw GitHub
Actions log text per module.

These are best-effort and never raise: callers always get a dict.
"""
from __future__ import annotations

import re
from typing import Any


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s")


def _clean(line: str) -> str:
    line = _ANSI_RE.sub("", line)
    line = _TS_RE.sub("", line)
    return line.rstrip()


def _iter_clean(log: str):
    for raw in log.splitlines():
        c = _clean(raw)
        if c:
            yield c


def summarize(module_key: str, log: str | None) -> dict[str, Any]:
    if not log:
        return {"module": module_key, "available": False}
    if module_key == "trading_pal":
        return _summarize_trading(log)
    if module_key == "option_pal":
        return _summarize_option(log)
    if module_key == "heartbeat_pal":
        return _summarize_heartbeat(log)
    return {"module": module_key, "available": False}


# ---------------------------------------------------------------------------
# trading_pal
# ---------------------------------------------------------------------------

def _summarize_trading(log: str) -> dict[str, Any]:
    regime = None
    orders: list[dict] = []
    summary_lines: list[str] = []
    errors: list[str] = []

    regime_re = re.compile(r"regime[:= ]+([A-Z_]+)", re.IGNORECASE)
    order_re = re.compile(
        r"\b(BUY|SELL|HOLD|TRIM|ADD)\b\s+([A-Z][A-Z0-9.]{0,5})"
        r"(?:.*?(?:qty|shares|x)\s*[:= ]?\s*([0-9]+(?:\.[0-9]+)?))?",
        re.IGNORECASE,
    )
    err_re = re.compile(r"\b(ERROR|Traceback|FAILED)\b", re.IGNORECASE)

    for line in _iter_clean(log):
        if regime is None:
            m = regime_re.search(line)
            if m:
                regime = m.group(1).upper()
        m = order_re.search(line)
        if m and len(orders) < 50:
            side, sym, qty = m.group(1).upper(), m.group(2).upper(), m.group(3)
            if sym not in {"USD", "ETF", "VIX"}:
                orders.append({"side": side, "symbol": sym, "qty": qty})
        if err_re.search(line) and len(errors) < 10:
            errors.append(line[:240])
        if "============" in line or line.startswith("#"):
            summary_lines.append(line)

    return {
        "module": "trading_pal",
        "available": True,
        "regime": regime,
        "orders": orders[:25],
        "order_count": len(orders),
        "errors": errors,
        "headline": _first_nonempty(summary_lines, default="Trading run complete."),
    }


# ---------------------------------------------------------------------------
# option_pal
# ---------------------------------------------------------------------------

def _summarize_option(log: str) -> dict[str, Any]:
    calls = 0
    puts = 0
    closes = 0
    rolls = 0
    sample_lines: list[str] = []
    errors: list[str] = []

    for line in _iter_clean(log):
        low = line.lower()
        if "covered call" in low or "(calls)" in low or "call recommendation" in low:
            calls += 1
        if "put recommend" in low or "(puts)" in low or "sell put" in low:
            puts += 1
        if "buy to close" in low or "close alert" in low:
            closes += 1
        if "roll" in low and "recommend" in low:
            rolls += 1
        if "ERROR" in line or "Traceback" in line:
            errors.append(line[:240])
        if low.startswith(("calls:", "puts:", "covered", "put selling", "account", "holdings")):
            sample_lines.append(line)

    return {
        "module": "option_pal",
        "available": True,
        "metrics": {
            "calls": calls, "puts": puts,
            "close_alerts": closes, "rolls": rolls,
        },
        "headline": _first_nonempty(sample_lines, default="Option scan complete."),
        "errors": errors[:10],
    }


# ---------------------------------------------------------------------------
# heartbeat_pal
# ---------------------------------------------------------------------------

def _summarize_heartbeat(log: str) -> dict[str, Any]:
    pool_size = None
    tier_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0}
    top: list[dict] = []
    errors: list[str] = []

    pool_re = re.compile(r"Pool size[:= ]+(\d+)")
    alert_re = re.compile(
        r"(CRITICAL|HIGH|MEDIUM)\b.*?\b([A-Z]{1,5})\b.*?(?:score[:= ]?\s*([0-9.]+))?",
        re.IGNORECASE,
    )

    for line in _iter_clean(log):
        if pool_size is None:
            m = pool_re.search(line)
            if m:
                pool_size = int(m.group(1))
        m = alert_re.search(line)
        if m:
            tier = m.group(1).upper()
            sym = m.group(2).upper()
            score = m.group(3)
            if tier in tier_counts and sym not in {"INFO", "DEBUG"}:
                tier_counts[tier] += 1
                if len(top) < 15:
                    top.append({"tier": tier, "symbol": sym, "score": score})
        if "ERROR" in line or "Traceback" in line:
            errors.append(line[:240])

    return {
        "module": "heartbeat_pal",
        "available": True,
        "pool_size": pool_size,
        "tiers": tier_counts,
        "top": top,
        "errors": errors[:10],
        "headline": (
            f"{sum(tier_counts.values())} alert(s) "
            f"(C:{tier_counts['CRITICAL']} H:{tier_counts['HIGH']} M:{tier_counts['MEDIUM']})"
        ),
    }


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _first_nonempty(seq, default: str = "") -> str:
    for s in seq:
        s = (s or "").strip()
        if s:
            return s[:200]
    return default

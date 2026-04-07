"""Logging with level-based formatting matching bash output.

Supports an optional JSON-lines sink file for machine-readable output
consumed by the web layer's SSE streaming.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

_LOG_FILE: Path | None = None
_SINK_FILE: Path | None = None


def init_log(log_dir: Path, sink_path: Path | None = None) -> None:
    global _LOG_FILE, _SINK_FILE
    log_dir.mkdir(parents=True, exist_ok=True)
    _LOG_FILE = log_dir / "harness.log"
    if sink_path:
        sink_path.parent.mkdir(parents=True, exist_ok=True)
        _SINK_FILE = sink_path


def init_sink(sink_path: Path) -> None:
    """Initialize only the JSON-lines sink (used by init command)."""
    global _SINK_FILE
    sink_path.parent.mkdir(parents=True, exist_ok=True)
    _SINK_FILE = sink_path


def log(level: str, msg: str, *, progress: int | None = None, phase: str | None = None) -> None:
    ts = datetime.datetime.now().strftime("%H:%M:%S")

    colors = {
        "INFO": "\033[0;36m",
        "OK": "\033[0;32m",
        "WARN": "\033[1;33m",
        "ERROR": "\033[0;31m",
        "STEP": "\033[0;34m",
        "HEAD": "\033[1m\033[0;36m",
    }
    nc = "\033[0m"
    c = colors.get(level, "")

    prefix = {
        "OK": " ✓",
        "WARN": " ⚠",
        "ERROR": " ✗",
        "STEP": " ▶",
        "HEAD": "",
    }.get(level, "")

    if level == "HEAD":
        print(f"\n{c}═══ [{ts}] {msg} ═══{nc}", flush=True)
    else:
        print(f"{c}[{ts}]{prefix}{nc} {msg}", flush=True)

    if _LOG_FILE:
        with open(_LOG_FILE, "a") as f:
            f.write(f"[{ts}] [{level}] {msg}\n")

    if _SINK_FILE:
        record: dict = {"ts": ts, "level": level, "msg": msg}
        if progress is not None:
            record["progress"] = progress
        if phase is not None:
            record["phase"] = phase
        with open(_SINK_FILE, "a") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def log_event(event_type: str, payload: dict) -> None:
    """Write a structured event as JSON-lines to the sink file.

    Each record is {"type": event_type, "ts": "HH:MM:SS", ...payload}.
    No-op when no sink is configured.
    """
    if not _SINK_FILE:
        return
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    record = {"type": event_type, "ts": ts, **payload}
    with open(_SINK_FILE, "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

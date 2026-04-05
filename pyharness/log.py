"""Logging with level-based formatting matching bash output."""

from __future__ import annotations

import datetime
from pathlib import Path

_LOG_FILE: Path | None = None


def init_log(log_dir: Path) -> None:
    global _LOG_FILE
    log_dir.mkdir(parents=True, exist_ok=True)
    _LOG_FILE = log_dir / "harness.log"


def log(level: str, msg: str) -> None:
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

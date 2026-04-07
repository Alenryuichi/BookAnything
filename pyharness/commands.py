"""Command file reader for interactive generation control."""
from __future__ import annotations

import json
from pathlib import Path

from pyharness.log import log


def read_commands(path: Path) -> list[dict]:
    """Read commands from JSON array file, delete after reading."""
    if not path.exists():
        return []
    try:
        raw = path.read_text(encoding="utf-8")
        commands = json.loads(raw)
        path.unlink(missing_ok=True)
        if isinstance(commands, list):
            return commands
        log("WARN", f"Command file is not a JSON array: {path}")
        return []
    except (json.JSONDecodeError, OSError) as e:
        log("WARN", f"Malformed command file {path}: {e}")
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return []

"""Claude Agent SDK wrapper with structured output, retry, and timeout."""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

import os as _os
CLAUDE_CMD = _os.environ.get("CLAUDE_CMD", "claude")


class ClaudeClient:
    """Thin wrapper around the Claude CLI for headless invocations.

    Uses `claude -p` under the hood so that `.claude/` project context
    (rules, skills, hooks) is automatically loaded. Can be replaced with
    the Agent SDK's Python client when available for direct API calls.
    """

    def __init__(
        self,
        cwd: Path | str = ".",
        timeout: int = 600,
        cmd: str | None = None,
    ) -> None:
        self.cwd = Path(cwd)
        self.timeout = timeout
        self.cmd = cmd or CLAUDE_CMD

    async def run(
        self,
        prompt: str,
        allowed_tools: list[str] | None = None,
        max_turns: int = 30,
        response_model: Type[T] | None = None,
    ) -> T | str | None:
        """Run a headless claude -p call and return the result.

        If response_model is provided, parse the result as that Pydantic model.
        """
        args = [
            self.cmd, "-p", prompt,
            "--output-format", "json",
            "--max-turns", str(max_turns),
        ]
        if allowed_tools:
            args.extend(["--allowedTools", ",".join(allowed_tools)])

        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                *args,
                cwd=str(self.cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            ),
            timeout=self.timeout,
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=self.timeout,
        )

        if proc.returncode != 0:
            raise RuntimeError(f"Claude CLI exited with {proc.returncode}: {stderr.decode()[-500:]}")

        raw = stdout.decode()

        # Extract result from CLI JSON envelope
        try:
            envelope = json.loads(raw)
            text = envelope.get("result", raw)
        except json.JSONDecodeError:
            text = raw

        if response_model is not None:
            cleaned = self._extract_json(text)
            if cleaned:
                data = json.loads(cleaned)
                return response_model(**data)
            raise ValueError(f"Could not parse response as {response_model.__name__}")

        return text

    @staticmethod
    def _extract_json(text: str) -> str | None:
        """Extract JSON from text that may have markdown fences or prose prefix."""
        t = text.strip()
        if t.startswith("```"):
            t = t.split("\n", 1)[1] if "\n" in t else t[3:]
            if t.endswith("```"):
                t = t[:-3].strip()

        if t.startswith("{"):
            try:
                json.loads(t)
                return t
            except json.JSONDecodeError:
                pass

        first = t.find("{")
        last = t.rfind("}")
        if first >= 0 and last > first:
            candidate = t[first:last + 1]
            try:
                json.loads(candidate)
                return candidate
            except json.JSONDecodeError:
                pass

        return None

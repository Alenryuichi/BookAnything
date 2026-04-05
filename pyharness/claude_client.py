"""Claude Agent SDK wrapper with structured output, retry, and timeout."""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

import os as _os
CLAUDE_CMD = _os.environ.get("CLAUDE_CMD", "claude")

logger = logging.getLogger(__name__)

_RETRYABLE_ERRORS = (
    RuntimeError,       # non-zero exit
    asyncio.TimeoutError,
    json.JSONDecodeError,
    ValueError,         # response_model parse failure
    OSError,            # process spawn failure
)


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
        max_retries: int = 2,
        base_delay: float = 5.0,
    ) -> None:
        self.cwd = Path(cwd)
        self.timeout = timeout
        self.cmd = cmd or CLAUDE_CMD
        self.max_retries = max_retries
        self.base_delay = base_delay

    async def run(
        self,
        prompt: str,
        allowed_tools: list[str] | None = None,
        max_turns: int = 30,
        response_model: Type[T] | None = None,
    ) -> T | str | None:
        """Run a headless claude -p call with retry and return the result.

        Retries up to max_retries times with exponential backoff on transient
        errors (non-zero exit, timeout, empty response, parse failure).

        If response_model is provided, parse the result as that Pydantic model.

        Note: allowed_tools is accepted for API compatibility but NOT passed
        to the CLI. Tool restrictions are enforced by .claude/rules/ instead,
        which works across all CLI variants.
        """
        last_error: Exception | None = None

        for attempt in range(1 + self.max_retries):
            try:
                return await self._run_once(prompt, max_turns, response_model)
            except _RETRYABLE_ERRORS as exc:
                last_error = exc
                if attempt < self.max_retries:
                    delay = self.base_delay * (2 ** attempt)
                    logger.warning(
                        "Attempt %d/%d failed (%s: %s), retrying in %.0fs...",
                        attempt + 1, 1 + self.max_retries,
                        type(exc).__name__, str(exc)[:120], delay,
                    )
                    await asyncio.sleep(delay)

        raise last_error  # type: ignore[misc]

    async def _run_once(
        self,
        prompt: str,
        max_turns: int,
        response_model: Type[T] | None,
    ) -> T | str | None:
        """Single attempt at running the CLI."""
        args = [
            self.cmd, "-p", prompt,
            "--output-format", "json",
            "--max-turns", str(max_turns),
        ]

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
            err_detail = stderr.decode()[-500:]
            try:
                envelope = json.loads(stdout.decode())
                if envelope.get("is_error"):
                    err_detail = envelope.get("result", err_detail)[:500]
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            raise RuntimeError(f"Claude CLI exited with {proc.returncode}: {err_detail}")

        raw = stdout.decode()
        if not raw.strip():
            raise RuntimeError("Claude CLI returned empty response")

        # Extract result from CLI JSON envelope
        try:
            envelope = json.loads(raw)
            text = envelope.get("result", raw)
        except json.JSONDecodeError:
            text = raw

        if not text or not text.strip():
            raise RuntimeError("Claude CLI returned empty result text")

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

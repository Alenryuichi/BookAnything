"""Error classification, remediation strategies, and structured error ledger."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional


class ErrorClass(str, Enum):
    EMPTY_RESPONSE = "empty_response"
    MALFORMED_JSON = "malformed_json"
    SCHEMA_VIOLATION = "schema_violation"
    TIMEOUT = "timeout"
    CLI_ERROR = "cli_error"
    UNKNOWN = "unknown"


RETRYABLE = {
    ErrorClass.EMPTY_RESPONSE,
    ErrorClass.MALFORMED_JSON,
    ErrorClass.SCHEMA_VIOLATION,
    ErrorClass.TIMEOUT,
    ErrorClass.UNKNOWN,
}


def classify_error(exc: Exception, raw_output: str = "") -> ErrorClass:
    """Map an exception + raw output to a canonical ErrorClass."""
    if isinstance(exc, asyncio.TimeoutError):
        return ErrorClass.TIMEOUT

    msg = str(exc).lower()

    if "empty response" in msg or "empty result" in msg:
        return ErrorClass.EMPTY_RESPONSE

    if isinstance(exc, json.JSONDecodeError) or "jsondecodeerror" in msg:
        if not raw_output.strip():
            return ErrorClass.EMPTY_RESPONSE
        return ErrorClass.MALFORMED_JSON

    if isinstance(exc, (ValueError, TypeError)):
        if "validation" in msg or "field required" in msg or "missing" in msg:
            return ErrorClass.SCHEMA_VIOLATION
        if "parse" in msg or "json" in msg:
            return ErrorClass.MALFORMED_JSON

    if isinstance(exc, RuntimeError):
        if "exited with" in msg:
            if "not logged in" in msg or "login" in msg or "auth" in msg:
                return ErrorClass.CLI_ERROR
            if "rate" in msg or "limit" in msg:
                return ErrorClass.CLI_ERROR
            return ErrorClass.MALFORMED_JSON

    return ErrorClass.UNKNOWN


def build_error_context(
    error_class: ErrorClass,
    error_message: str,
    raw_preview: str,
) -> str:
    """Build a prompt section describing the previous failure for retry."""
    lines = [
        "## IMPORTANT: Previous Attempt Failed",
        f"Error classification: {error_class.value}",
        f"Error message: {error_message}",
    ]

    if raw_preview.strip():
        preview = raw_preview[:500]
        lines.append(f"Your previous output (first 500 chars):\n```\n{preview}\n```")
    else:
        lines.append("Your previous output was: (empty)")

    remediation = {
        ErrorClass.EMPTY_RESPONSE: (
            "You returned an empty response. You MUST output a non-empty, "
            "valid JSON object. Do not output anything except the JSON."
        ),
        ErrorClass.MALFORMED_JSON: (
            "Your output was not valid JSON. Common mistakes: trailing commas, "
            "unescaped quotes inside strings, missing closing braces. "
            "Output ONLY a raw JSON object — no markdown fences, no prose."
        ),
        ErrorClass.SCHEMA_VIOLATION: (
            "Your JSON was syntactically valid but failed schema validation. "
            "Ensure all required fields are present: chapter_id, title, subtitle, "
            "summary, opening_hook, sections (array of objects with title+content), "
            "key_takeaways, further_reading."
        ),
        ErrorClass.TIMEOUT: (
            "The previous attempt timed out. Please produce a shorter, "
            "more focused response. Reduce the number of code snippets "
            "and keep sections concise."
        ),
    }

    hint = remediation.get(error_class, "Please try again carefully.")
    lines.append(f"\nRemediation: {hint}")

    return "\n".join(lines)


class ErrorLedger:
    """Append-only structured error log written as JSONL.

    Records are written to `output/logs/errors.jsonl` and can be read
    back by the planner to prioritize failed chapters.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._current_iteration_errors: list[dict] = []

    def record(
        self,
        iteration: int,
        phase: str,
        chapter_id: str,
        error_class: ErrorClass,
        attempt: int,
        max_attempts: int,
        error_message: str,
        raw_output_preview: str = "",
    ) -> None:
        entry = {
            "ts": datetime.now().strftime("%H:%M:%S"),
            "iteration": iteration,
            "phase": phase,
            "chapter_id": chapter_id,
            "error_class": error_class.value,
            "attempt": attempt,
            "max_attempts": max_attempts,
            "error_message": error_message[:500],
            "raw_output_preview": raw_output_preview[:300],
        }
        self._current_iteration_errors.append(entry)
        with open(self.path, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def get_unresolved(self, iteration: int) -> list[dict]:
        """Return errors from the given iteration where all attempts were exhausted."""
        max_attempt_by_chapter: dict[str, dict] = {}
        for e in self._current_iteration_errors:
            if e["iteration"] != iteration:
                continue
            ch = e["chapter_id"]
            if ch not in max_attempt_by_chapter or e["attempt"] > max_attempt_by_chapter[ch]["attempt"]:
                max_attempt_by_chapter[ch] = e
        return [
            e for e in max_attempt_by_chapter.values()
            if e["attempt"] >= e["max_attempts"]
        ]

    def get_all_unresolved(self) -> list[dict]:
        """Return the latest error for each chapter that exhausted all attempts."""
        max_by_chapter: dict[str, dict] = {}
        try:
            with open(self.path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        e = json.loads(line)
                        if e.get("attempt", 0) >= e.get("max_attempts", 1):
                            max_by_chapter[e["chapter_id"]] = e
                    except json.JSONDecodeError:
                        continue
        except FileNotFoundError:
            pass
        return list(max_by_chapter.values())

    def clear_for_chapter(self, chapter_id: str) -> None:
        """Mark a chapter as resolved (remove from in-memory tracker)."""
        self._current_iteration_errors = [
            e for e in self._current_iteration_errors
            if e["chapter_id"] != chapter_id
        ]

    def reset_iteration(self) -> None:
        """Clear in-memory errors for a new iteration."""
        self._current_iteration_errors = []

"""Shared fixtures for e2e tests."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

E2E_DIR = Path(__file__).parent
GOLDEN_DIR = E2E_DIR / "golden"
FIXTURE_REPO = E2E_DIR / "fixture-repo"
FIXTURE_PROJECT_YAML = E2E_DIR / "fixture-project.yaml"


@pytest.fixture
def harness_dir() -> Path:
    """Root of the harness project."""
    return E2E_DIR.parent.parent


@pytest.fixture
def fixture_repo_path() -> Path:
    return FIXTURE_REPO


@pytest.fixture
def work_dir(tmp_path: Path) -> Path:
    """Isolated working directory that mimics harness_dir layout.

    Copies necessary files so the runner can operate without touching the
    real harness workspace.
    """
    # Copy fixture project yaml with resolved repo_path
    yaml_src = FIXTURE_PROJECT_YAML.read_text()
    yaml_src = yaml_src.replace("PLACEHOLDER", str(FIXTURE_REPO.resolve()))
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    (projects_dir / "minipipe.yaml").write_text(yaml_src)

    # Create directories the runner expects
    (tmp_path / "output" / "logs").mkdir(parents=True)
    (tmp_path / "output" / "screenshots").mkdir(parents=True)

    # Minimal web-app stub so eval_visual doesn't crash
    webapp = tmp_path / "web-app"
    webapp.mkdir()
    (webapp / "package.json").write_text('{"name":"web-app","scripts":{"build":"echo ok"}}')

    return tmp_path


def _load_golden_response(name: str) -> str:
    """Load a golden CLI response and return the envelope JSON string."""
    path = GOLDEN_DIR / name
    return path.read_text()


def _load_golden_chapter(chapter_id: str) -> str:
    """Load a golden chapter JSON and wrap it in a CLI envelope."""
    path = GOLDEN_DIR / "chapters" / f"{chapter_id}.json"
    chapter_json = path.read_text().strip()
    envelope = {
        "type": "result",
        "subtype": "success",
        "is_error": False,
        "result": chapter_json,
    }
    return json.dumps(envelope, ensure_ascii=False)


_GOLDEN_RESPONSES: dict[str, str] = {}


def _get_golden_responses() -> dict[str, str]:
    """Lazy-load all golden responses into a lookup dict."""
    if not _GOLDEN_RESPONSES:
        _GOLDEN_RESPONSES["plan"] = _load_golden_response("plan_response.json")
        for ch_file in sorted((GOLDEN_DIR / "chapters").glob("*.json")):
            ch_id = ch_file.stem
            _GOLDEN_RESPONSES[ch_id] = _load_golden_chapter(ch_id)
    return _GOLDEN_RESPONSES


def _match_response(prompt: str) -> str:
    """Pick the correct golden response based on prompt keywords."""
    responses = _get_golden_responses()
    if "编辑" in prompt and "计划" in prompt or "制定下一轮写作计划" in prompt:
        return responses["plan"]
    for ch_id in responses:
        if ch_id.startswith("ch") and ch_id in prompt:
            return responses[ch_id]
    return responses["plan"]


@pytest.fixture
def mock_claude():
    """Patch ClaudeClient._run_once to return golden responses."""

    async def fake_run_once(self, prompt: str, max_turns: int, response_model: Any) -> Any:
        raw = _match_response(prompt)
        envelope = json.loads(raw)
        text = envelope.get("result", raw)

        if response_model is not None:
            from pyharness.claude_client import ClaudeClient
            cleaned = ClaudeClient._extract_json(text)
            if cleaned:
                data = json.loads(cleaned)
                return response_model(**data)
            raise ValueError(f"Could not parse as {response_model.__name__}")

        return text

    with patch("pyharness.claude_client.ClaudeClient._run_once", new=fake_run_once):
        yield

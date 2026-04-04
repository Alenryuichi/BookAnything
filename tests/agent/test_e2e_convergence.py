"""E2E convergence test — real Claude CLI smoke test.

All tests in this module require a real Claude CLI and are marked as slow.
Run with: pytest -m slow
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


def _claude_available() -> bool:
    """Check if the Claude CLI is on PATH."""
    cmd = os.environ.get("CLAUDE_CMD", "claude")
    try:
        subprocess.run(
            [cmd, "--version"],
            capture_output=True,
            timeout=10,
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


@pytest.mark.slow
class TestE2EConvergence:
    """Smoke test: run 1 real iteration and verify the pipeline doesn't crash.

    These tests are expensive (~$0.3-0.5 per run) and require CLAUDE_CMD
    to be available. They are skipped by default; run with `pytest -m slow`.

    Cost protection: --max-hours 0.01 (≈36s) ensures the loop exits after
    at most 1 iteration even if Claude responds quickly. A future
    --max-iterations flag would provide an additional safeguard.
    """

    @pytest.fixture
    def harness_dir(self) -> Path:
        return Path(__file__).resolve().parent.parent.parent

    def test_single_iteration_no_crash(self, harness_dir: Path, tmp_path: Path):
        """Run 1 harness iteration via subprocess; verify state.json updates."""
        if not _claude_available():
            pytest.skip("Claude CLI not available (set CLAUDE_CMD or install claude)")

        project_cfg = harness_dir / "projects" / "pydantic-ai.yaml"
        if not project_cfg.exists():
            project_cfg = next(harness_dir.glob("projects/*.yaml"), None)
            if project_cfg is None:
                pytest.skip("No project config found in projects/")

        state_path = harness_dir / "state.json"

        if state_path.exists():
            state_before = json.loads(state_path.read_text())
            initial_iteration = state_before.get("iteration", 0)
        else:
            initial_iteration = 0

        result = subprocess.run(
            [
                sys.executable, "-m", "pyharness", "run",
                "--project", str(project_cfg),
                "--max-hours", "0.01",
                "--resume",
            ],
            cwd=str(harness_dir),
            capture_output=True,
            text=True,
            timeout=300,
        )

        assert result.returncode == 0, (
            f"Harness exited with code {result.returncode}.\n"
            f"stderr (last 1000 chars): {result.stderr[-1000:]}"
        )

        assert state_path.exists(), "state.json was not created"
        state_after = json.loads(state_path.read_text())
        assert state_after.get("iteration", 0) >= initial_iteration + 1, (
            f"Iteration did not advance: before={initial_iteration}, "
            f"after={state_after.get('iteration')}"
        )
        assert state_after.get("score", -1) >= 0, "Score should be non-negative"

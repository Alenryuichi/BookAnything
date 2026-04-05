"""Layer 2: Live E2E test with real Claude CLI.

Runs the full harness pipeline against the fixture repo using real Claude
API calls. This is expensive (~$0.50) and slow (~5 min).

Run with: pytest tests/e2e/test_live.py -v -m live
Skip with: pytest -m "not live"
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from pyharness.schemas import ChapterJSON, HarnessState

from .conftest import FIXTURE_REPO, FIXTURE_PROJECT_YAML


def _claude_available() -> bool:
    cmd = os.environ.get("CLAUDE_CMD", "claude")
    try:
        subprocess.run([cmd, "--version"], capture_output=True, timeout=10)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


pytestmark = pytest.mark.live


@pytest.fixture
def live_work_dir(tmp_path: Path) -> Path:
    """Create an isolated workspace for the live test run."""
    yaml_src = FIXTURE_PROJECT_YAML.read_text()
    yaml_src = yaml_src.replace("PLACEHOLDER", str(FIXTURE_REPO.resolve()))

    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    cfg_path = projects_dir / "minipipe.yaml"
    cfg_path.write_text(yaml_src)

    (tmp_path / "output" / "logs").mkdir(parents=True)
    (tmp_path / "output" / "screenshots").mkdir(parents=True)

    webapp = tmp_path / "web-app"
    webapp.mkdir()
    (webapp / "package.json").write_text('{"name":"web-app","scripts":{"build":"echo ok"}}')

    return tmp_path


class TestLivePipeline:
    """Run 1 real iteration against the fixture repo."""

    def test_single_iteration_no_crash(self, live_work_dir: Path):
        if not _claude_available():
            pytest.skip("Claude CLI not available (set CLAUDE_CMD)")

        cfg_path = live_work_dir / "projects" / "minipipe.yaml"

        result = subprocess.run(
            [
                sys.executable, "-m", "pyharness", "run",
                "--project", str(cfg_path),
                "--max-iterations", "1",
                "--max-hours", "0.5",
                "--threshold", "100",
                "--max-parallel", "2",
            ],
            cwd=str(live_work_dir),
            capture_output=True,
            text=True,
            timeout=600,
        )

        assert result.returncode == 0, (
            f"Harness exited with code {result.returncode}.\n"
            f"stdout (last 500): {result.stdout[-500:]}\n"
            f"stderr (last 500): {result.stderr[-500:]}"
        )

        state_path = live_work_dir / "state.json"
        assert state_path.exists(), "state.json was not created"
        state = HarnessState(**json.loads(state_path.read_text()))
        assert state.iteration >= 1
        assert state.score >= 0

        chapters_dir = live_work_dir / "knowledge" / "MiniPipe" / "chapters"
        if chapters_dir.exists():
            chapters = list(chapters_dir.glob("*.json"))
            assert len(chapters) >= 1, "At least 1 chapter should be written"

            for ch_path in chapters:
                data = json.loads(ch_path.read_text())
                ch = ChapterJSON(**data)
                assert ch.chapter_id
                assert ch.title


class TestLiveInit:
    """Test pyharness init against the fixture repo."""

    def test_init_produces_yaml(self, tmp_path: Path):
        if not _claude_available():
            pytest.skip("Claude CLI not available (set CLAUDE_CMD)")

        result = subprocess.run(
            [
                sys.executable, "-m", "pyharness", "init",
                str(FIXTURE_REPO.resolve()),
            ],
            cwd=str(tmp_path),
            capture_output=True,
            text=True,
            timeout=300,
        )

        assert result.returncode == 0, (
            f"Init exited with code {result.returncode}.\n"
            f"stderr: {result.stderr[-500:]}"
        )

        harness_root = Path(__file__).resolve().parent.parent.parent
        yamls = list((harness_root / "projects").glob("minipipe*.yaml"))
        assert len(yamls) >= 1, "Init should produce a project YAML"

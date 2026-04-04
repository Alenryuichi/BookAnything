"""Golden run replay — verify parsing consistency after code changes.

Recorded Claude CLI responses are replayed through the current parser,
ensuring that refactors to JSON cleaning or prompt assembly don't break
the output pipeline.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from pyharness.claude_client import ClaudeClient
from pyharness.schemas import PlanOutput

GOLDEN = Path(__file__).resolve().parent.parent / "agent_fixtures" / "golden_run"


@pytest.fixture
def plan_fixture() -> dict:
    return json.loads((GOLDEN / "plan_response.json").read_text())


@pytest.fixture
def chapter_fixture() -> dict:
    return json.loads((GOLDEN / "chapter_response.json").read_text())


class TestGoldenPlanReplay:
    @pytest.mark.asyncio
    async def test_parse_golden_plan(self, plan_fixture: dict):
        """Mock subprocess returns golden plan fixture; ClaudeClient parses valid plan."""
        raw_stdout = json.dumps(plan_fixture).encode()

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (raw_stdout, b"")
        mock_proc.returncode = 0

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", return_value=mock_proc):
            client = ClaudeClient(cwd=".", timeout=9999)
            result = await client.run(
                prompt="test",
                response_model=PlanOutput,
            )

        assert isinstance(result, PlanOutput)
        assert len(result.chapters_to_write) > 0
        assert result.plan_summary != ""

    @pytest.mark.asyncio
    async def test_plan_fixture_has_valid_envelope(self, plan_fixture: dict):
        """Golden plan fixture has the expected CLI envelope structure."""
        assert "result" in plan_fixture
        text = plan_fixture["result"]
        cleaned = ClaudeClient._extract_json(text)  # private access intentional — golden replay tests core parsing
        assert cleaned is not None
        data = json.loads(cleaned)
        assert "chapters_to_write" in data


class TestGoldenChapterReplay:
    @pytest.mark.asyncio
    async def test_parse_golden_chapter(self, chapter_fixture: dict):
        """Mock subprocess returns golden chapter fixture; parse valid chapter JSON."""
        raw_stdout = json.dumps(chapter_fixture).encode()

        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (raw_stdout, b"")
        mock_proc.returncode = 0

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", return_value=mock_proc):
            client = ClaudeClient(cwd=".", timeout=9999)
            result = await client.run(prompt="test")

        assert result is not None
        parsed = json.loads(ClaudeClient._extract_json(result) or result)
        assert "chapter_id" in parsed
        assert "sections" in parsed
        assert len(parsed["sections"]) > 0

    @pytest.mark.asyncio
    async def test_chapter_fixture_has_valid_envelope(self, chapter_fixture: dict):
        """Golden chapter fixture has the expected CLI envelope structure."""
        assert "result" in chapter_fixture
        text = chapter_fixture["result"]
        cleaned = ClaudeClient._extract_json(text)  # private access intentional
        assert cleaned is not None
        data = json.loads(cleaned)
        assert "chapter_id" in data
        assert "word_count" in data


class TestScoreConsistency:
    def test_golden_chapter_eval_consistency(self, chapter_fixture: dict, tmp_path: Path):
        """Eval scores from golden fixture match direct computation."""
        from pyharness.eval import eval_content

        text = chapter_fixture["result"]
        cleaned = ClaudeClient._extract_json(text)  # private access intentional
        assert cleaned is not None
        parsed = json.loads(cleaned)

        chapters_dir = tmp_path / "chapters"
        chapters_dir.mkdir()
        chapter_id = parsed.get("chapter_id", "ch01-test")
        (chapters_dir / f"{chapter_id}.json").write_text(json.dumps(parsed, ensure_ascii=False))

        score_from_replay = eval_content(chapters_dir, total_chapters=1)

        chapters_dir_2 = tmp_path / "chapters2"
        chapters_dir_2.mkdir()
        (chapters_dir_2 / f"{chapter_id}.json").write_text(json.dumps(parsed, ensure_ascii=False))
        score_direct = eval_content(chapters_dir_2, total_chapters=1)

        assert score_from_replay.score == score_direct.score
        assert score_from_replay.breakdown == score_direct.breakdown

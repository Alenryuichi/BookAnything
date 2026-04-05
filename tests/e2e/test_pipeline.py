"""Layer 1: E2E pipeline test with recorded Claude responses.

Exercises the full harness pipeline (plan → write → eval) using golden
fixture data. No real Claude API calls are made.

Run with: pytest tests/e2e/test_pipeline.py -v
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from pyharness.config import load_project_config
from pyharness.eval import eval_content, merge_scores, eval_visual, eval_interaction
from pyharness.runner import HarnessRunner
from pyharness.schemas import ChapterJSON, PlanOutput, HarnessState

from .conftest import FIXTURE_REPO, GOLDEN_DIR


class TestFixtureProjectConfig:
    """Verify the fixture project config is valid and stable."""

    def test_loads_successfully(self, work_dir: Path):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")
        assert config.name == "MiniPipe"
        assert config.language == "Python"
        assert len(config.chapters) == 4

    def test_chapter_ids(self, work_dir: Path):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")
        ids = config.get_all_chapter_ids()
        assert ids == ["ch01-overview", "ch02-core-model", "ch03-processing", "ch04-cli-and-output"]

    def test_chapter_prerequisites(self, work_dir: Path):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")
        ch04 = config.get_chapter("ch04-cli-and-output")
        assert ch04 is not None
        assert "ch03-processing" in ch04.prerequisites


class TestGoldenData:
    """Verify golden chapter JSONs pass schema validation."""

    @pytest.fixture(params=sorted((GOLDEN_DIR / "chapters").glob("*.json")), ids=lambda p: p.stem)
    def golden_chapter(self, request: pytest.FixtureRequest) -> dict:
        return json.loads(request.param.read_text())

    def test_chapter_schema_valid(self, golden_chapter: dict):
        ch = ChapterJSON(**golden_chapter)
        assert ch.chapter_id.startswith("ch")
        assert ch.title
        assert len(ch.sections) >= 2
        assert ch.word_count > 0

    def test_chapter_has_required_content(self, golden_chapter: dict):
        ch = ChapterJSON(**golden_chapter)
        assert ch.opening_hook, "Every chapter should have an opening hook"
        assert len(ch.key_takeaways) >= 2, "At least 2 key takeaways"

    def test_plan_response_valid(self):
        envelope = json.loads((GOLDEN_DIR / "plan_response.json").read_text())
        plan_json = json.loads(envelope["result"])
        plan = PlanOutput(**plan_json)
        assert len(plan.chapters_to_write) == 4
        assert plan.plan_summary


class TestPlanPhase:
    """Test the plan phase with mocked Claude."""

    @pytest.mark.asyncio
    async def test_plan_returns_chapters(self, work_dir: Path, mock_claude):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")
        runner = HarnessRunner(config=config, max_iterations=1)
        runner.harness_dir = work_dir
        runner.chapters_dir = work_dir / "knowledge" / config.name / "chapters"
        runner.chapters_dir.mkdir(parents=True, exist_ok=True)

        from pyharness.phases.plan import step_plan
        plan = await step_plan(runner, iteration=1, last_eval_feedback="")

        assert plan is not None
        assert len(plan.chapters_to_write) > 0
        assert all(ch.id.startswith("ch") for ch in plan.chapters_to_write)


class TestWritePhase:
    """Test the write phase with mocked Claude."""

    @pytest.mark.asyncio
    async def test_writes_chapter_files(self, work_dir: Path, mock_claude):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")
        runner = HarnessRunner(config=config, max_iterations=1)
        runner.harness_dir = work_dir
        runner.chapters_dir = work_dir / "knowledge" / config.name / "chapters"
        runner.chapters_dir.mkdir(parents=True, exist_ok=True)

        from pyharness.phases.plan import step_plan
        plan = await step_plan(runner, iteration=1, last_eval_feedback="")

        from pyharness.phases.write import step_write_chapters
        await step_write_chapters(runner, iteration=1, plan=plan)

        written = list(runner.chapters_dir.glob("*.json"))
        assert len(written) >= 1, f"Expected chapter files, found: {written}"

        for path in written:
            data = json.loads(path.read_text())
            ch = ChapterJSON(**data)
            assert ch.title
            assert ch.word_count > 0


class TestEvalPhase:
    """Test deterministic evaluation on golden chapters."""

    @pytest.fixture
    def chapters_dir(self, tmp_path: Path) -> Path:
        """Copy golden chapters to a temp directory for eval."""
        ch_dir = tmp_path / "chapters"
        ch_dir.mkdir()
        for f in (GOLDEN_DIR / "chapters").glob("*.json"):
            (ch_dir / f.name).write_text(f.read_text())
        return ch_dir

    def test_content_eval_positive(self, chapters_dir: Path):
        result = eval_content(chapters_dir, total_chapters=4)
        assert result.score > 0, f"Expected positive content score, got {result.score}"
        assert "coverage" in result.breakdown

    def test_content_eval_dimensions(self, chapters_dir: Path):
        result = eval_content(chapters_dir, total_chapters=4)
        assert 0 <= result.score <= 40

    def test_merged_eval(self, chapters_dir: Path, tmp_path: Path):
        content = eval_content(chapters_dir, total_chapters=4)
        visual = eval_visual(tmp_path, tmp_path / "nonexistent-report.json")
        interaction = eval_interaction(tmp_path / "nonexistent-report.json")
        merged = merge_scores(content, visual, interaction)

        assert 0 <= merged.score <= 100
        assert merged.scores.content == content.score
        assert merged.format_feedback()


class TestFullPipeline:
    """Run the orchestration loop for 1 iteration with mocked Claude.

    This is the primary e2e regression test. It exercises:
    plan → write → eval → state update.
    Build and visual test are skipped (no real web-app in temp dir).
    """

    @pytest.mark.asyncio
    async def test_single_iteration(self, work_dir: Path, mock_claude):
        config = load_project_config(work_dir / "projects" / "minipipe.yaml")

        runner = HarnessRunner(
            config=config,
            max_hours=1,
            max_iterations=1,
            threshold=100,
            max_parallel=4,
        )
        runner.harness_dir = work_dir
        runner.knowledge_dir = work_dir / "knowledge" / config.name
        runner.chapters_dir = runner.knowledge_dir / "chapters"
        runner.log_dir = work_dir / "output" / "logs"
        runner.webapp_dir = work_dir / "web-app"
        runner.lock_file = work_dir / ".harness.lock"
        runner.state = __import__("pyharness.state", fromlist=["StateManager"]).StateManager(
            work_dir / "state.json"
        )

        await runner.run()

        # Assert: state.json was created and updated
        state_path = work_dir / "state.json"
        assert state_path.exists(), "state.json should be created"
        state = HarnessState(**json.loads(state_path.read_text()))
        assert state.iteration >= 1, f"Iteration should advance, got {state.iteration}"
        assert state.score >= 0, f"Score should be non-negative, got {state.score}"

        # Assert: chapter files were written
        chapters = list(runner.chapters_dir.glob("*.json"))
        assert len(chapters) >= 1, f"At least 1 chapter should be written, found {len(chapters)}"

        # Assert: each chapter is valid
        for ch_path in chapters:
            data = json.loads(ch_path.read_text())
            ch = ChapterJSON(**data)
            assert ch.chapter_id
            assert ch.title

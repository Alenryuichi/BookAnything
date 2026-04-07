"""Task 7.5: Verify concurrency limit and error isolation in write phase.

Tests that:
1. asyncio.Semaphore(max_parallel) limits concurrent chapter writes
2. return_exceptions=True isolates per-chapter errors
3. Failed chapters don't block or crash successful ones
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pyharness.config import BookConfig, ChapterConfig, ProjectConfig
from pyharness.runner import HarnessRunner
from pyharness.schemas import ChapterToWrite, PlanOutput


def _make_config(n_chapters: int = 6) -> ProjectConfig:
    return ProjectConfig(
        name="TestProject",
        repo_path="/tmp/test",
        target_dir="src",
        language="Python",
        description="Concurrency test project",
        book=BookConfig(title="Test Book"),
        chapters=[
            ChapterConfig(id=f"ch{i:02d}", title=f"Chapter {i}", subtitle=f"Sub {i}")
            for i in range(1, n_chapters + 1)
        ],
    )


@pytest.fixture
def runner(tmp_path):
    config = _make_config(6)
    r = HarnessRunner(config=config, max_hours=1, threshold=85, max_parallel=2, resume=False)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.chapters_dir.mkdir(parents=True)
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"
    return r


class TestConcurrencyLimit:
    """Verify the semaphore caps concurrent chapter writes."""

    @pytest.mark.asyncio
    async def test_max_parallel_respected(self, runner):
        """At most max_parallel chapters should be writing simultaneously."""
        max_concurrent = 0
        current_concurrent = 0
        lock = asyncio.Lock()

        original_write_single = None

        async def tracking_write(runner_arg, iteration, chapter_id, focus):
            nonlocal max_concurrent, current_concurrent
            async with lock:
                current_concurrent += 1
                if current_concurrent > max_concurrent:
                    max_concurrent = current_concurrent

            await asyncio.sleep(0.01)  # simulate work

            # Write a valid chapter file so the test produces output
            data = {"chapter_id": chapter_id, "title": f"Chapter {chapter_id}", "sections": []}
            out_path = runner_arg.chapters_dir / f"{chapter_id}.json"
            out_path.write_text(json.dumps(data))

            async with lock:
                current_concurrent -= 1
            return True

        plan = PlanOutput(
            plan_summary="test",
            chapters_to_write=[
                ChapterToWrite(id=f"ch{i:02d}", focus="test") for i in range(1, 7)
            ],
        )

        with patch("pyharness.phases.write._write_single_chapter", side_effect=tracking_write):
            from pyharness.phases.write import step_write_chapters
            await step_write_chapters(runner, iteration=1, plan=plan)

        assert max_concurrent <= runner.max_parallel, (
            f"Max concurrent was {max_concurrent}, but max_parallel is {runner.max_parallel}"
        )
        assert max_concurrent > 0, "At least one chapter should have been written"

    @pytest.mark.asyncio
    async def test_all_chapters_written(self, runner):
        """All chapters in the plan should be attempted."""
        written_ids: list[str] = []
        lock = asyncio.Lock()

        async def tracking_write(runner_arg, iteration, chapter_id, focus):
            async with lock:
                written_ids.append(chapter_id)
            return True

        plan = PlanOutput(
            plan_summary="test",
            chapters_to_write=[
                ChapterToWrite(id="ch01", focus="a"),
                ChapterToWrite(id="ch02", focus="b"),
                ChapterToWrite(id="ch03", focus="c"),
            ],
        )

        with patch("pyharness.phases.write._write_single_chapter", side_effect=tracking_write):
            from pyharness.phases.write import step_write_chapters
            await step_write_chapters(runner, iteration=1, plan=plan)

        assert set(written_ids) == {"ch01", "ch02", "ch03"}


class TestErrorIsolation:
    """Verify return_exceptions=True prevents one failure from cascading."""

    @pytest.mark.asyncio
    async def test_one_failure_does_not_block_others(self, runner):
        """When one chapter raises, remaining chapters should still succeed."""
        call_count = 0
        lock = asyncio.Lock()

        async def flaky_write(runner_arg, iteration, chapter_id, focus):
            nonlocal call_count
            async with lock:
                call_count += 1

            if chapter_id == "ch02":
                raise RuntimeError("ch02 failed!")
            return True

        plan = PlanOutput(
            plan_summary="test",
            chapters_to_write=[
                ChapterToWrite(id="ch01", focus="a"),
                ChapterToWrite(id="ch02", focus="b"),
                ChapterToWrite(id="ch03", focus="c"),
            ],
        )

        with patch("pyharness.phases.write._write_single_chapter", side_effect=flaky_write):
            from pyharness.phases.write import step_write_chapters
            # Should not raise — errors are captured per-chapter
            await step_write_chapters(runner, iteration=1, plan=plan)

        assert call_count == 3, "All 3 chapters should have been attempted"

    @pytest.mark.asyncio
    async def test_all_fail_gracefully(self, runner):
        """Even if every chapter fails, step_write_chapters should not raise."""
        async def always_fail(runner_arg, iteration, chapter_id, focus):
            raise RuntimeError(f"{chapter_id} exploded")

        plan = PlanOutput(
            plan_summary="test",
            chapters_to_write=[
                ChapterToWrite(id="ch01", focus="a"),
                ChapterToWrite(id="ch02", focus="b"),
            ],
        )

        with patch("pyharness.phases.write._write_single_chapter", side_effect=always_fail):
            from pyharness.phases.write import step_write_chapters
            # Should complete without raising
            await step_write_chapters(runner, iteration=1, plan=plan)

    @pytest.mark.asyncio
    async def test_empty_plan_is_noop(self, runner):
        """Empty chapters_to_write should be a no-op."""
        plan = PlanOutput(plan_summary="test", chapters_to_write=[])

        from pyharness.phases.write import step_write_chapters
        await step_write_chapters(runner, iteration=1, plan=plan)

    @pytest.mark.asyncio
    async def test_none_plan_is_noop(self, runner):
        """None plan should be a no-op."""
        from pyharness.phases.write import step_write_chapters
        await step_write_chapters(runner, iteration=1, plan=None)

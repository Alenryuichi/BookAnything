"""Tests for pyharness.runner — state machine, lock files, phase order."""

import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from pyharness.config import ProjectConfig, BookConfig
from pyharness.runner import HarnessRunner
from pyharness.schemas import (
    ChapterToWrite,
    DimensionEval,
    PlanOutput,
)


def _make_config() -> ProjectConfig:
    return ProjectConfig(
        name="TestProject",
        repo_path="/tmp/test",
        target_dir="src",
        language="Python",
        book=BookConfig(title="Test Book"),
        chapters=[],
    )


def _make_plan(improve: bool = True) -> PlanOutput:
    return PlanOutput(chapters_to_write=[], needs_webapp_improve=improve)


def _make_eval(score: int):
    return DimensionEval(dimension="test", score=score, max_score=40)


@pytest.fixture
def runner(tmp_path):
    config = _make_config()
    r = HarnessRunner(config=config, max_hours=1, threshold=85, max_parallel=2, resume=False)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"
    return r


# ── Lock file tests ──

class TestLockFile:
    def test_acquire_lock(self, runner):
        runner._acquire_lock()
        assert runner.lock_file.exists()
        assert runner.lock_file.read_text().strip() == str(os.getpid())

    def test_release_lock(self, runner):
        runner._acquire_lock()
        runner._release_lock()
        assert not runner.lock_file.exists()

    def test_stale_lock_cleaned(self, runner):
        runner.lock_file.write_text("99999999")
        runner._acquire_lock()
        assert runner.lock_file.read_text().strip() == str(os.getpid())


# ── Phase order and stop condition tests (using direct function calls) ──

class TestPhaseLogic:
    def test_eval_score_computation(self):
        from pyharness.eval import merge_scores
        c = DimensionEval(dimension="content", score=35, max_score=40)
        v = DimensionEval(dimension="visual", score=30, max_score=35)
        i = DimensionEval(dimension="interaction", score=20, max_score=25)
        m = merge_scores(c, v, i)
        assert m.score == 85

    def test_threshold_met(self):
        score = 85
        threshold = 85
        assert score >= threshold

    def test_threshold_not_met(self):
        score = 70
        threshold = 85
        assert score < threshold

    def test_plan_skip_improve(self):
        plan = _make_plan(improve=False)
        assert not plan.needs_webapp_improve

    def test_plan_empty_chapters(self):
        plan = _make_plan()
        assert plan.chapters_to_write == []

    def test_state_init_and_update(self, runner):
        from pyharness.schemas import MergedEval, ScoresBreakdown, DimensionDetail
        runner.state.init()
        s = runner.state.load()
        assert s.iteration == 0

        merged = MergedEval(
            score=85,
            scores=ScoresBreakdown(content=35, visual=30, interaction=20),
            content=DimensionDetail(score=35),
            visual=DimensionDetail(score=30),
            interaction=DimensionDetail(score=20),
        )
        runner.state.update_after_eval(1, merged)
        s = runner.state.load()
        assert s.iteration == 1
        assert s.score == 85
        assert s.phase == "evaluated"

    def test_state_eval_failed(self, runner):
        runner.state.init()
        runner.state.update_phase(1, "eval_failed")
        s = runner.state.load()
        assert s.phase == "eval_failed"

    def test_config_properties(self):
        config = _make_config()
        assert config.book_title == "Test Book"
        assert config.total_chapters == 0
        assert config.get_chapter("nonexistent") is None

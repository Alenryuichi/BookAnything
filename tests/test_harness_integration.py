"""Tasks 11.1–11.3: Integration tests for the Python harness.

11.1: Run Python harness for 1 iteration on test fixtures, verify state.json
11.2: Verify state.json format compatibility (write externally, read with harness)
11.3: Verify state continuity across iterations (simulate multi-iteration progression)
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pyharness.config import BookConfig, ChapterConfig, ProjectConfig
from pyharness.runner import HarnessRunner
from pyharness.schemas import (
    ChapterToWrite,
    DimensionDetail,
    DimensionEval,
    HarnessState,
    MergedEval,
    PlanOutput,
    ScoreRecord,
    ScoresBreakdown,
)
from pyharness.state import StateManager


def _cfg(n_chapters: int = 3) -> ProjectConfig:
    return ProjectConfig(
        name="TestProject",
        repo_path="/tmp/test",
        target_dir="src",
        language="Python",
        description="Integration test project",
        book=BookConfig(title="Test Book"),
        chapters=[
            ChapterConfig(id=f"ch{i:02d}", title=f"Chapter {i}", subtitle=f"Sub {i}")
            for i in range(1, n_chapters + 1)
        ],
    )


def _merged(score: int) -> MergedEval:
    third = score // 3
    return MergedEval(
        score=score,
        scores=ScoresBreakdown(content=third, visual=third, interaction=third),
        content=DimensionDetail(score=third),
        visual=DimensionDetail(score=third),
        interaction=DimensionDetail(score=third),
    )


def _tracking_async(name: str, call_order: list[str], return_value=None):
    async def _fn(*_a, **_kw):
        call_order.append(name)
        return return_value
    return _fn


def _tracking_sync(name: str, call_order: list[str], return_value=None):
    def _fn(*_a, **_kw):
        call_order.append(name)
        return return_value
    return _fn


_PHASE_PATCHES = {
    "plan": "pyharness.phases.plan.step_plan",
    "write": "pyharness.phases.write.step_write_chapters",
    "improve": "pyharness.phases.improve.step_improve_webapp",
    "review": "pyharness.phases.review.step_code_review",
    "build": "pyharness.phases.build.step_build_site",
    "visual_test": "pyharness.phases.visual_test.step_visual_test",
    "checkpoint": "pyharness.phases.build.step_checkpoint",
}

_EVAL_PATCHES = {
    "eval_content": "pyharness.runner.eval_content",
    "eval_visual": "pyharness.runner.eval_visual",
    "eval_interaction": "pyharness.runner.eval_interaction",
    "merge_scores": "pyharness.runner.merge_scores",
}


@pytest.fixture
def runner(tmp_path):
    r = HarnessRunner(config=_cfg(), max_hours=1, threshold=85, max_parallel=2)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"
    return r


# ── 11.1: Single iteration end-to-end ──


class TestSingleIterationE2E:
    """Run the harness for 1 iteration and verify state.json is correct."""

    @pytest.mark.asyncio
    async def test_one_iteration_updates_state(self, runner):
        call_order: list[str] = []
        plan_out = PlanOutput(
            plan_summary="write first chapters",
            chapters_to_write=[ChapterToWrite(id="ch01", focus="intro")],
            needs_webapp_improve=True,
        )
        merged = _merged(70)

        patches = {}
        for name, target in _PHASE_PATCHES.items():
            if name == "plan":
                patches[name] = patch(target, side_effect=_tracking_async("plan", call_order, plan_out))
            elif name == "checkpoint":
                patches[name] = patch(target, side_effect=_tracking_async("checkpoint", call_order))
            else:
                patches[name] = patch(target, side_effect=_tracking_async(name, call_order))

        for name, target in _EVAL_PATCHES.items():
            if name == "merge_scores":
                patches[name] = patch(target, side_effect=_tracking_sync("eval", call_order, merged))
            else:
                patches[name] = patch(target, return_value=MagicMock())

        patches["sleep"] = patch("pyharness.runner.asyncio.sleep", new_callable=AsyncMock)

        # Run exactly 1 iteration
        runner.max_iterations = 1

        for p in patches.values():
            p.start()
        try:
            await runner.run()
        finally:
            for p in patches.values():
                p.stop()

        # Verify state.json
        assert runner.state.path.exists()
        state_data = json.loads(runner.state.path.read_text())
        assert state_data["iteration"] == 1
        assert state_data["score"] == 70
        assert state_data["phase"] == "evaluated"
        assert len(state_data["history"]) == 1
        assert state_data["history"][0]["total"] == 70
        assert state_data["history"][0]["iteration"] == 1
        assert state_data["scores"]["content"] == 70 // 3
        assert state_data["scores"]["visual"] == 70 // 3
        assert state_data["scores"]["interaction"] == 70 // 3

    @pytest.mark.asyncio
    async def test_all_phases_execute_in_order(self, runner):
        call_order: list[str] = []
        plan_out = PlanOutput(
            plan_summary="test",
            chapters_to_write=[ChapterToWrite(id="ch01", focus="test")],
            needs_webapp_improve=True,
        )
        merged = _merged(70)

        patches = {}
        for name, target in _PHASE_PATCHES.items():
            if name == "plan":
                patches[name] = patch(target, side_effect=_tracking_async("plan", call_order, plan_out))
            else:
                patches[name] = patch(target, side_effect=_tracking_async(name, call_order))

        for name, target in _EVAL_PATCHES.items():
            if name == "merge_scores":
                patches[name] = patch(target, side_effect=_tracking_sync("eval", call_order, merged))
            else:
                patches[name] = patch(target, return_value=MagicMock())

        patches["sleep"] = patch("pyharness.runner.asyncio.sleep", new_callable=AsyncMock)
        runner.max_iterations = 1

        for p in patches.values():
            p.start()
        try:
            await runner.run()
        finally:
            for p in patches.values():
                p.stop()

        # Phases before final build
        before_final = call_order[:call_order.index("checkpoint") + 1]
        assert before_final == [
            "plan", "write", "improve", "review",
            "build", "visual_test", "eval", "checkpoint",
        ]


# ── 11.2: State format compatibility ──


class TestStateFormatCompatibility:
    """Verify the Python harness can read externally-produced state.json files
    (simulating interoperability with the bash harness)."""

    def test_load_external_state_format(self, tmp_path):
        """Simulate a state.json written by bash (raw JSON, same schema)."""
        external_state = {
            "iteration": 5,
            "score": 62,
            "scores": {"content": 30, "visual": 20, "interaction": 12},
            "phase": "evaluated",
            "start_time": "2024-01-15T10:00:00Z",
            "modules_analyzed": ["mod1", "mod2"],
            "errors": [],
            "history": [
                {"iteration": 1, "total": 20, "content": 10, "visual": 5, "interaction": 5, "time": "2024-01-15T10:10:00Z"},
                {"iteration": 2, "total": 35, "content": 15, "visual": 12, "interaction": 8, "time": "2024-01-15T10:20:00Z"},
                {"iteration": 3, "total": 45, "content": 20, "visual": 15, "interaction": 10, "time": "2024-01-15T10:30:00Z"},
                {"iteration": 4, "total": 55, "content": 25, "visual": 18, "interaction": 12, "time": "2024-01-15T10:40:00Z"},
                {"iteration": 5, "total": 62, "content": 30, "visual": 20, "interaction": 12, "time": "2024-01-15T10:50:00Z"},
            ],
        }
        state_path = tmp_path / "state.json"
        state_path.write_text(json.dumps(external_state, indent=2))

        sm = StateManager(state_path)
        state = sm.load()

        assert state.iteration == 5
        assert state.score == 62
        assert state.scores.content == 30
        assert state.scores.visual == 20
        assert state.scores.interaction == 12
        assert state.phase == "evaluated"
        assert len(state.history) == 5
        assert state.history[0].iteration == 1
        assert state.history[4].total == 62

    def test_python_state_round_trips_through_json(self, tmp_path):
        """State written by Python should be readable by any JSON consumer."""
        sm = StateManager(tmp_path / "state.json")
        sm.init()

        merged = MergedEval(
            score=75,
            scores=ScoresBreakdown(content=35, visual=25, interaction=15),
            content=DimensionDetail(score=35),
            visual=DimensionDetail(score=25),
            interaction=DimensionDetail(score=15),
        )
        sm.update_after_eval(1, merged)

        raw = json.loads((tmp_path / "state.json").read_text())

        # Verify JSON structure is compatible with external consumers
        assert isinstance(raw["iteration"], int)
        assert isinstance(raw["score"], int)
        assert isinstance(raw["scores"], dict)
        assert set(raw["scores"].keys()) == {"content", "visual", "interaction"}
        assert isinstance(raw["history"], list)
        assert isinstance(raw["history"][0]["iteration"], int)
        assert isinstance(raw["history"][0]["total"], int)
        assert "time" in raw["history"][0]

    def test_extra_fields_are_tolerated(self, tmp_path):
        """State with extra unknown fields should still load (forward compat)."""
        state_data = {
            "iteration": 3,
            "score": 50,
            "scores": {"content": 20, "visual": 18, "interaction": 12},
            "phase": "evaluated",
            "history": [],
            "errors": [],
            "modules_analyzed": [],
            "extra_future_field": "should not break",
            "another_new_field": 42,
        }
        state_path = tmp_path / "state.json"
        state_path.write_text(json.dumps(state_data))

        sm = StateManager(state_path)
        # Pydantic v2 ignores extra fields by default
        state = sm.load()
        assert state.iteration == 3
        assert state.score == 50


# ── 11.3: Multi-iteration state continuity ──


class TestStateContiguity:
    """Verify state accumulates correctly across multiple iterations."""

    @pytest.mark.asyncio
    async def test_two_iterations_accumulate_history(self, tmp_path):
        """Run 2 iterations and verify history has 2 entries."""
        r = HarnessRunner(config=_cfg(), max_hours=1, threshold=85, max_iterations=2)
        r.harness_dir = tmp_path
        r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
        r.chapters_dir = r.knowledge_dir / "chapters"
        r.log_dir = tmp_path / "output" / "logs"
        r.webapp_dir = tmp_path / "web-app"
        r.lock_file = tmp_path / ".harness.lock"
        r.state.path = tmp_path / "state.json"

        call_order: list[str] = []
        plan_out = PlanOutput(
            plan_summary="test",
            chapters_to_write=[ChapterToWrite(id="ch01", focus="test")],
            needs_webapp_improve=True,
        )

        iteration_scores = iter([_merged(50), _merged(70)])

        def _next_score(*a, **kw):
            call_order.append("eval")
            return next(iteration_scores)

        patches = {}
        for name, target in _PHASE_PATCHES.items():
            patches[name] = patch(target, side_effect=_tracking_async(name, call_order, plan_out if name == "plan" else None))
        for name, target in _EVAL_PATCHES.items():
            if name == "merge_scores":
                patches[name] = patch(target, side_effect=_next_score)
            else:
                patches[name] = patch(target, return_value=MagicMock())
        patches["sleep"] = patch("pyharness.runner.asyncio.sleep", new_callable=AsyncMock)

        for p in patches.values():
            p.start()
        try:
            await r.run()
        finally:
            for p in patches.values():
                p.stop()

        state_data = json.loads(r.state.path.read_text())
        assert state_data["iteration"] == 2
        assert state_data["score"] == 70
        assert len(state_data["history"]) == 2
        assert state_data["history"][0]["total"] == 50
        assert state_data["history"][0]["iteration"] == 1
        assert state_data["history"][1]["total"] == 70
        assert state_data["history"][1]["iteration"] == 2

    @pytest.mark.asyncio
    async def test_resume_preserves_prior_history(self, tmp_path):
        """When resuming from existing state, prior history entries are kept."""
        prior_state = HarnessState(
            iteration=3,
            score=60,
            phase="evaluated",
            scores=ScoresBreakdown(content=25, visual=20, interaction=15),
            history=[
                ScoreRecord(iteration=1, total=30, content=10, visual=12, interaction=8),
                ScoreRecord(iteration=2, total=45, content=18, visual=15, interaction=12),
                ScoreRecord(iteration=3, total=60, content=25, visual=20, interaction=15),
            ],
        )

        state_path = tmp_path / "state.json"
        state_path.write_text(prior_state.model_dump_json(indent=2))

        r = HarnessRunner(
            config=_cfg(), max_hours=1, threshold=85,
            max_iterations=4, resume=True,
        )
        r.harness_dir = tmp_path
        r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
        r.chapters_dir = r.knowledge_dir / "chapters"
        r.log_dir = tmp_path / "output" / "logs"
        r.webapp_dir = tmp_path / "web-app"
        r.lock_file = tmp_path / ".harness.lock"
        r.state.path = state_path

        call_order: list[str] = []
        plan_out = PlanOutput(
            plan_summary="improve",
            chapters_to_write=[ChapterToWrite(id="ch01", focus="rewrite")],
            needs_webapp_improve=True,
        )

        patches = {}
        for name, target in _PHASE_PATCHES.items():
            patches[name] = patch(target, side_effect=_tracking_async(name, call_order, plan_out if name == "plan" else None))
        for name, target in _EVAL_PATCHES.items():
            if name == "merge_scores":
                patches[name] = patch(target, side_effect=_tracking_sync("eval", call_order, _merged(80)))
            else:
                patches[name] = patch(target, return_value=MagicMock())
        patches["sleep"] = patch("pyharness.runner.asyncio.sleep", new_callable=AsyncMock)

        for p in patches.values():
            p.start()
        try:
            await r.run()
        finally:
            for p in patches.values():
                p.stop()

        state_data = json.loads(state_path.read_text())
        assert state_data["iteration"] == 4
        assert state_data["score"] == 80
        assert len(state_data["history"]) == 4
        # Prior history preserved
        assert state_data["history"][0]["iteration"] == 1
        assert state_data["history"][0]["total"] == 30
        assert state_data["history"][2]["iteration"] == 3
        assert state_data["history"][2]["total"] == 60
        # New iteration appended
        assert state_data["history"][3]["iteration"] == 4
        assert state_data["history"][3]["total"] == 80

    def test_state_continuity_manual_write_then_python_read(self, tmp_path):
        """Simulate: iteration 1 written by external tool, iteration 2 by Python."""
        external_state = {
            "iteration": 1,
            "score": 35,
            "scores": {"content": 15, "visual": 12, "interaction": 8},
            "phase": "evaluated",
            "start_time": None,
            "modules_analyzed": [],
            "errors": [],
            "history": [
                {"iteration": 1, "total": 35, "content": 15, "visual": 12, "interaction": 8, "time": "2024-01-15T10:10:00Z"},
            ],
        }
        state_path = tmp_path / "state.json"
        state_path.write_text(json.dumps(external_state, indent=2))

        sm = StateManager(state_path)
        state = sm.load()
        assert state.iteration == 1
        assert len(state.history) == 1

        merged = MergedEval(
            score=55,
            scores=ScoresBreakdown(content=22, visual=18, interaction=15),
            content=DimensionDetail(score=22),
            visual=DimensionDetail(score=18),
            interaction=DimensionDetail(score=15),
        )
        sm.update_after_eval(2, merged)

        state = sm.load()
        assert state.iteration == 2
        assert state.score == 55
        assert len(state.history) == 2
        assert state.history[0].iteration == 1
        assert state.history[0].total == 35
        assert state.history[1].iteration == 2
        assert state.history[1].total == 55

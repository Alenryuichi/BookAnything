"""Integration tests for runner.run() — async main loop orchestration."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pyharness.config import BookConfig, ProjectConfig
from pyharness.runner import HarnessRunner
from pyharness.schemas import (
    DimensionDetail,
    MergedEval,
    PlanOutput,
    ScoresBreakdown,
)


def _cfg() -> ProjectConfig:
    return ProjectConfig(
        name="TestProject",
        repo_path="/tmp/test",
        book=BookConfig(title="Test Book"),
        chapters=[],
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
    """Create an async function that appends *name* to *call_order*."""
    async def _fn(*_a, **_kw):
        call_order.append(name)
        return return_value
    return _fn


def _tracking_sync(name: str, call_order: list[str], return_value=None):
    """Create a sync function that appends *name* to *call_order*."""
    def _fn(*_a, **_kw):
        call_order.append(name)
        return return_value
    return _fn


@pytest.fixture
def runner(tmp_path):
    r = HarnessRunner(config=_cfg(), max_hours=1, threshold=85)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"
    return r


# Patch paths: lazy-imported phase functions at their source modules,
# top-level eval imports at pyharness.runner, asyncio.sleep at runner namespace.
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
def harness(runner):
    """Patch all phases, eval functions, and asyncio.sleep.

    Yields ``(runner, call_order, mocks)`` where *call_order* is a shared
    list that each mock appends to.  Default behaviour:
    - plan → PlanOutput(needs_webapp_improve=True)
    - merge_scores → score 50 (below threshold, so loop continues)
    - other phases → no-op
    Tests override ``mocks[name].side_effect`` as needed.
    """
    call_order: list[str] = []
    plan_out = PlanOutput(needs_webapp_improve=True, chapters_to_write=[])

    side_effects = {
        "plan": _tracking_async("plan", call_order, plan_out),
        "write": _tracking_async("write", call_order),
        "improve": _tracking_async("improve", call_order),
        "review": _tracking_async("review", call_order),
        "build": _tracking_async("build", call_order),
        "visual_test": _tracking_async("visual_test", call_order),
        "checkpoint": _tracking_async("checkpoint", call_order),
        "merge_scores": _tracking_sync("eval", call_order, _merged(50)),
    }

    patches = {}
    for name, target in _PHASE_PATCHES.items():
        patches[name] = patch(target, side_effect=side_effects[name])
    for name, target in _EVAL_PATCHES.items():
        if name == "merge_scores":
            patches[name] = patch(target, side_effect=side_effects[name])
        else:
            patches[name] = patch(target, return_value=MagicMock())
    patches["sleep"] = patch("pyharness.runner.asyncio.sleep", new_callable=AsyncMock)

    mocks: dict[str, MagicMock] = {}
    for name, p in patches.items():
        mocks[name] = p.start()

    yield runner, call_order, mocks

    for p in patches.values():
        p.stop()


# ── 1.2 Normal loop: 7 phases in order ──


def _time_after_n_calls(n: int, start: float = 1000, overtime: float = 3601):
    """Return *start* for the first *n* calls, then *start + overtime*."""
    counter = {"c": 0}
    def _fake():
        counter["c"] += 1
        return start if counter["c"] <= n else start + overtime
    return _fake


async def test_normal_loop_phase_order(harness):
    """All 7 phases + checkpoint execute in sequence; time-exit on 2nd iteration."""
    runner, call_order, mocks = harness

    with patch("pyharness.runner.time") as mock_time:
        mock_time.time.side_effect = _time_after_n_calls(2)
        await runner.run()

    first_iter = call_order[: call_order.index("checkpoint") + 1]
    assert first_iter == [
        "plan", "write", "improve", "review",
        "build", "visual_test", "eval", "checkpoint",
    ]
    assert call_order[-1] == "build"  # final build after loop


# ── 1.3 Conditional skip improve ──


async def test_skip_improve_when_not_needed(harness):
    """improve phase absent from call_order when plan.needs_webapp_improve=False."""
    runner, call_order, mocks = harness

    no_improve_plan = PlanOutput(needs_webapp_improve=False, chapters_to_write=[])
    mocks["plan"].side_effect = _tracking_async("plan", call_order, no_improve_plan)
    mocks["merge_scores"].side_effect = _tracking_sync("eval", call_order, _merged(90))

    await runner.run()

    assert "improve" not in call_order
    assert "plan" in call_order
    assert "write" in call_order
    assert "review" in call_order


# ── 1.4 Score threshold stops loop ──


async def test_score_threshold_stops_loop(harness):
    """Loop completes after exactly 1 iteration when score >= threshold."""
    runner, call_order, mocks = harness

    mocks["merge_scores"].side_effect = _tracking_sync("eval", call_order, _merged(90))

    await runner.run()

    assert call_order.count("plan") == 1
    assert call_order.count("eval") == 1
    # break fires BEFORE checkpoint, so checkpoint never runs.
    assert "checkpoint" not in call_order


# ── 1.5 Time limit stops loop ──


async def test_time_limit_stops_loop(harness):
    """Loop exits before starting a new iteration when elapsed > max_hours."""
    runner, call_order, mocks = harness

    with patch("pyharness.runner.time") as mock_time:
        mock_time.time.side_effect = _time_after_n_calls(2)
        await runner.run()

    assert call_order.count("plan") == 1
    assert "checkpoint" in call_order  # completed full first iteration
    assert call_order[-1] == "build"   # final build after time-exit


# ── 1.6 Phase error resilience ──


async def test_improve_error_does_not_stop_loop(harness):
    """RuntimeError in improve → review/build/visual_test/eval still execute."""
    runner, call_order, mocks = harness

    mocks["improve"].side_effect = RuntimeError("boom")
    mocks["merge_scores"].side_effect = _tracking_sync("eval", call_order, _merged(90))

    await runner.run()

    # RuntimeError is raised before _tracking_async appends to call_order,
    # so "improve" never appears — but the runner catches the exception.
    assert "improve" not in call_order
    for phase in ("review", "build", "visual_test", "eval"):
        assert phase in call_order, f"{phase} should still execute after improve error"


# ── 1.7 State update after eval ──


async def test_state_updated_after_eval(harness):
    """state.json reflects iteration=1, score=90, phase='evaluated' after eval."""
    runner, call_order, mocks = harness

    mocks["merge_scores"].side_effect = _tracking_sync("eval", call_order, _merged(90))

    await runner.run()

    state_data = json.loads(runner.state.path.read_text())
    assert state_data["iteration"] == 1
    assert state_data["score"] == 90
    assert state_data["phase"] == "evaluated"


# ── 1.8 Resume from existing state ──


async def test_resume_continues_from_existing_iteration(tmp_path):
    """When resume=True and state.json exists, iteration numbering continues."""
    from pyharness.schemas import HarnessState, ScoresBreakdown

    r = HarnessRunner(config=_cfg(), max_hours=1, threshold=85, resume=True)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"

    existing = HarnessState(
        iteration=3,
        score=60,
        phase="evaluated",
        scores=ScoresBreakdown(content=25, visual=20, interaction=15),
    )
    r.state.path.parent.mkdir(parents=True, exist_ok=True)
    r.state.path.write_text(existing.model_dump_json(indent=2))

    call_order: list[str] = []
    plan_out = PlanOutput(needs_webapp_improve=True, chapters_to_write=[])

    side_effects = {
        "plan": _tracking_async("plan", call_order, plan_out),
        "write": _tracking_async("write", call_order),
        "improve": _tracking_async("improve", call_order),
        "review": _tracking_async("review", call_order),
        "build": _tracking_async("build", call_order),
        "visual_test": _tracking_async("visual_test", call_order),
        "checkpoint": _tracking_async("checkpoint", call_order),
        "merge_scores": _tracking_sync("eval", call_order, _merged(90)),
    }

    patches = {}
    for name, target in _PHASE_PATCHES.items():
        patches[name] = patch(target, side_effect=side_effects[name])
    for name, target in _EVAL_PATCHES.items():
        if name == "merge_scores":
            patches[name] = patch(target, side_effect=side_effects[name])
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
    assert state_data["iteration"] == 4, "Should continue from iteration 3 → 4"
    assert state_data["score"] == 90
    assert "plan" in call_order

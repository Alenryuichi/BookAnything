"""Tests for pyharness.state — state management with atomic writes."""

import json
from pathlib import Path

import pytest

from pyharness.schemas import DimensionDetail, MergedEval, ScoresBreakdown
from pyharness.state import StateManager


class TestStateManager:
    def test_init(self, tmp_path):
        sm = StateManager(tmp_path / "state.json")
        state = sm.init()
        assert state.iteration == 0
        assert state.score == 0
        assert (tmp_path / "state.json").exists()

    def test_load_after_init(self, tmp_path):
        sm = StateManager(tmp_path / "state.json")
        sm.init()
        state = sm.load()
        assert state.iteration == 0

    def test_load_nonexistent_creates(self, tmp_path):
        sm = StateManager(tmp_path / "state.json")
        state = sm.load()
        assert state.iteration == 0
        assert (tmp_path / "state.json").exists()

    def test_update_after_eval(self, tmp_path):
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

        state = sm.load()
        assert state.iteration == 1
        assert state.score == 75
        assert state.scores.content == 35
        assert state.phase == "evaluated"
        assert len(state.history) == 1
        assert state.history[0].total == 75

    def test_update_phase(self, tmp_path):
        sm = StateManager(tmp_path / "state.json")
        sm.init()
        sm.update_phase(3, "eval_failed")
        state = sm.load()
        assert state.iteration == 3
        assert state.phase == "eval_failed"

    def test_atomic_write(self, tmp_path):
        sm = StateManager(tmp_path / "state.json")
        sm.init()
        merged = MergedEval(score=50, scores=ScoresBreakdown(content=20, visual=20, interaction=10))
        sm.update_after_eval(1, merged)

        raw = json.loads((tmp_path / "state.json").read_text())
        assert raw["score"] == 50

    @pytest.fixture
    def real_state(self):
        p = Path("state.json")
        if not p.exists():
            pytest.skip("No state.json available")
        return p

    def test_load_real_state(self, real_state):
        sm = StateManager(real_state)
        state = sm.load()
        assert state.iteration > 0
        assert len(state.history) > 0

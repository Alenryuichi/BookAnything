"""Tests for pyharness.state — state management with atomic writes."""

import asyncio
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


class TestAsyncLock:
    """Verify asyncio.Lock serializes concurrent state updates."""

    @pytest.mark.asyncio
    async def test_concurrent_updates_are_serialized(self, tmp_path):
        """Multiple async updates must not lose writes."""
        sm = StateManager(tmp_path / "state.json")
        sm.init()

        async def bump_phase(sm: StateManager, iteration: int):
            await sm.async_update_phase(iteration, f"phase-{iteration}")

        await asyncio.gather(*[bump_phase(sm, i) for i in range(1, 11)])

        state = sm.load()
        assert state.iteration >= 1
        assert state.phase.startswith("phase-")

    @pytest.mark.asyncio
    async def test_concurrent_eval_updates_preserve_history(self, tmp_path):
        """Concurrent async_update_after_eval calls must serialize correctly."""
        sm = StateManager(tmp_path / "state.json")
        sm.init()

        async def do_eval(sm: StateManager, iteration: int):
            merged = MergedEval(
                score=iteration * 10,
                scores=ScoresBreakdown(content=iteration * 3, visual=iteration * 4, interaction=iteration * 3),
                content=DimensionDetail(score=iteration * 3),
                visual=DimensionDetail(score=iteration * 4),
                interaction=DimensionDetail(score=iteration * 3),
            )
            await sm.async_update_after_eval(iteration, merged)

        await asyncio.gather(*[do_eval(sm, i) for i in range(1, 6)])

        state = sm.load()
        assert len(state.history) == 5
        assert state.iteration >= 1

    @pytest.mark.asyncio
    async def test_lock_prevents_interleaved_read_modify_write(self, tmp_path):
        """Without the lock, concurrent load-modify-write would lose updates.
        With the lock, all 20 updates should be present in history."""
        sm = StateManager(tmp_path / "state.json")
        sm.init()

        async def slow_update(sm: StateManager, iteration: int):
            async with sm._lock:
                state = sm.load()
                await asyncio.sleep(0)  # yield to event loop
                state.iteration = iteration
                state.phase = f"phase-{iteration}"
                from pyharness.schemas import ScoreRecord
                state.history.append(ScoreRecord(iteration=iteration, total=iteration))
                sm._write(state)

        await asyncio.gather(*[slow_update(sm, i) for i in range(1, 21)])

        state = sm.load()
        assert len(state.history) == 20

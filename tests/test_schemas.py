"""Tests for pyharness.schemas — Pydantic model compatibility."""

import json
from pathlib import Path

import pytest

from pyharness.schemas import (
    ChapterJSON,
    HarnessState,
    MergedEval,
    PlanOutput,
    ScoresBreakdown,
)


class TestHarnessState:
    @pytest.fixture
    def real_state(self):
        p = Path("state.json")
        if not p.exists():
            pytest.skip("No state.json available")
        return p

    def test_load_real_state(self, real_state):
        raw = json.loads(real_state.read_text())
        state = HarnessState(**raw)
        assert state.iteration >= 0
        assert state.score >= 0
        assert state.phase in ("init", "evaluated", "eval_failed")

    def test_round_trip(self, real_state):
        raw = json.loads(real_state.read_text())
        state = HarnessState(**raw)
        dumped = state.model_dump(mode="json")
        state2 = HarnessState(**dumped)
        assert state2.iteration == state.iteration
        assert state2.score == state.score

    def test_default_state(self):
        state = HarnessState()
        assert state.iteration == 0
        assert state.score == 0
        assert state.phase == "init"
        assert state.history == []

    def test_scores_breakdown(self):
        state = HarnessState(
            iteration=5, score=80,
            scores=ScoresBreakdown(content=35, visual=30, interaction=15),
        )
        assert state.scores.content == 35


class TestChapterJSON:
    @pytest.fixture
    def real_chapters(self):
        p = Path("knowledge/Pydantic AI/chapters")
        if not p.exists():
            pytest.skip("No chapter data available")
        return sorted(p.glob("*.json"))

    def test_load_real_chapters(self, real_chapters):
        for f in real_chapters[:3]:
            raw = json.loads(f.read_text())
            ch = ChapterJSON(**raw)
            assert ch.chapter_id
            assert ch.title
            assert len(ch.sections) >= 0

    def test_minimal_chapter(self):
        ch = ChapterJSON(chapter_id="ch01", title="Test")
        assert ch.word_count == 0
        assert ch.sections == []

    def test_full_chapter(self):
        ch = ChapterJSON(
            chapter_id="ch01",
            title="Test Chapter",
            subtitle="Sub",
            opening_hook="Hook text",
            sections=[{"heading": "S1", "content": "Content"}],
            key_takeaways=["T1", "T2"],
            further_thinking=["Q1"],
            word_count=3500,
        )
        assert ch.word_count == 3500
        assert len(ch.sections) == 1


class TestPlanOutput:
    def test_default(self):
        plan = PlanOutput()
        assert plan.chapters_to_write == []
        assert plan.needs_webapp_improve is True

    def test_from_dict(self):
        plan = PlanOutput(**{
            "plan_summary": "Write ch01 and ch02",
            "chapters_to_write": [{"id": "ch01", "focus": "intro"}, {"id": "ch02", "focus": "core"}],
            "needs_webapp_improve": False,
            "improvement_focus": "depth",
        })
        assert len(plan.chapters_to_write) == 2
        assert plan.chapters_to_write[0].id == "ch01"


class TestMergedEval:
    def test_format_feedback(self):
        m = MergedEval(
            score=75,
            scores=ScoresBreakdown(content=35, visual=25, interaction=15),
        )
        fb = m.format_feedback()
        assert "75/100" in fb
        assert "35/40" in fb

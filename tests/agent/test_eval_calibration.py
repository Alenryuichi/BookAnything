"""Eval calibration tests — verify scoring with known good/bad samples.

These tests ensure that eval formulas produce expected score ranges
for known fixtures. When formulas change, calibration drift is caught.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from pyharness.eval import eval_content, eval_visual, eval_interaction

FIXTURES = Path(__file__).resolve().parent.parent / "agent_fixtures" / "calibration"


@pytest.fixture
def good_chapter_dir(tmp_path: Path) -> Path:
    """Directory with a single high-quality chapter."""
    d = tmp_path / "chapters"
    d.mkdir()
    shutil.copy(FIXTURES / "good_chapter.json", d / "ch12-mcp-integration.json")
    return d


@pytest.fixture
def bad_chapter_dir(tmp_path: Path) -> Path:
    """Directory with a single low-quality chapter."""
    d = tmp_path / "chapters"
    d.mkdir()
    shutil.copy(FIXTURES / "bad_chapter.json", d / "ch99-placeholder.json")
    return d


@pytest.fixture
def good_report(tmp_path: Path) -> Path:
    shutil.copy(FIXTURES / "good_report.json", tmp_path / "report.json")
    return tmp_path / "report.json"


@pytest.fixture
def bad_report(tmp_path: Path) -> Path:
    shutil.copy(FIXTURES / "bad_report.json", tmp_path / "report.json")
    return tmp_path / "report.json"


class TestContentCalibration:
    def test_good_chapter_scores_perfect(self, good_chapter_dir: Path):
        result = eval_content(good_chapter_dir, total_chapters=1)
        assert result.score == 40, (
            f"Good chapter scored {result.score}/40, expected 40 (deterministic). "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"coverage": 15, "volume": 15, "depth": 10}
        assert result.issues == []

    def test_bad_chapter_scores_low(self, bad_chapter_dir: Path):
        result = eval_content(bad_chapter_dir, total_chapters=1)
        assert result.score == 15, (
            f"Bad chapter scored {result.score}/40, expected 15 (coverage only). "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"coverage": 15, "volume": 0, "depth": 0}


class TestVisualCalibration:
    def test_good_report_scores_perfect(self, good_report: Path, tmp_path: Path):
        webapp_dir = tmp_path / "webapp"
        (webapp_dir / "out").mkdir(parents=True)
        result = eval_visual(webapp_dir, good_report)
        assert result.score == 35, (
            f"Good report visual scored {result.score}/35, expected 35. "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"build": 10, "no_errors": 10, "mermaid": 8, "layout": 7}

    def test_bad_report_scores_zero(self, bad_report: Path, tmp_path: Path):
        result = eval_visual(tmp_path / "no-webapp", bad_report)
        assert result.score == 0, (
            f"Bad report visual scored {result.score}/35, expected 0. "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"build": 0, "no_errors": 0, "mermaid": 0, "layout": 0}


class TestInteractionCalibration:
    def test_good_report_scores_perfect(self, good_report: Path):
        result = eval_interaction(good_report)
        assert result.score == 25, (
            f"Good report interaction scored {result.score}/25, expected 25. "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"search": 8, "navigation": 7, "code_highlight": 5, "page_routing": 5}

    def test_bad_report_scores_minimal(self, bad_report: Path):
        result = eval_interaction(bad_report)
        assert result.score == 2, (
            f"Bad report interaction scored {result.score}/25, expected 2 (routing only). "
            f"Breakdown: {result.breakdown}"
        )
        assert result.breakdown == {"search": 0, "navigation": 0, "code_highlight": 0, "page_routing": 2}

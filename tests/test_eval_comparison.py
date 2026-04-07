"""Task 3.6: Eval comparison tests with fixture data.

Verifies Python eval functions produce expected scores on known inputs,
matching the deterministic formulas originally ported from bash.
Each test case uses manually-computed expected values to catch any
rounding or logic drift.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pyharness.eval import eval_content, eval_visual, eval_interaction, merge_scores


def _write_chapter(
    chapters_dir: Path,
    chapter_id: str,
    word_count: int = 3500,
    sections: int = 5,
    size_pad: int = 0,
) -> Path:
    data = {
        "chapter_id": chapter_id,
        "title": f"Chapter {chapter_id}",
        "subtitle": "test",
        "sections": [{"heading": f"s{i}", "content": "x" * 200} for i in range(sections)],
        "key_takeaways": ["a", "b", "c"],
        "word_count": word_count,
    }
    if size_pad > 0:
        data["_pad"] = "x" * size_pad
    path = chapters_dir / f"{chapter_id}.json"
    path.write_text(json.dumps(data, ensure_ascii=False))
    return path


def _write_report(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "report.json"
    path.write_text(json.dumps(data))
    return path


class TestEvalContentFixtures:
    """Fixture-based content eval with manually-verified expected scores.

    Formulas (integer division, matching bash truncation):
      coverage = analysis_count * 15 // total
      volume   = vol_count * 15 // safe_count    (vol: fsize>10240 && sections>=4)
      depth_a  = depth_a_count * 5 // safe_count  (wcount>=3000 && sections>=4)
      depth_b  = depth_b_count * 5 // safe_count  (sections>=5)
      depth    = depth_a + depth_b
    """

    def test_fixture_3_of_10_chapters_high_quality(self, tmp_path):
        chapters = tmp_path / "chapters"
        chapters.mkdir()
        for i in range(3):
            _write_chapter(chapters, f"ch{i:02d}", word_count=4000, sections=6, size_pad=12000)

        result = eval_content(chapters, total_chapters=10)

        # coverage: 3*15//10 = 4
        assert result.breakdown["coverage"] == 4
        # volume: 3*15//3 = 15 (all meet >10240 && >=4 sections)
        assert result.breakdown["volume"] == 15
        # depth_a: 3*5//3 = 5 (all >=3000 && >=4 sections)
        # depth_b: 3*5//3 = 5 (all >=5 sections)
        assert result.breakdown["depth"] == 10
        assert result.score == 4 + 15 + 10  # 29

    def test_fixture_7_of_10_mixed_quality(self, tmp_path):
        chapters = tmp_path / "chapters"
        chapters.mkdir()
        # 4 high-quality chapters
        for i in range(4):
            _write_chapter(chapters, f"ch{i:02d}", word_count=4000, sections=6, size_pad=12000)
        # 3 low-quality chapters (small files, few sections, low word count)
        for i in range(4, 7):
            _write_chapter(chapters, f"ch{i:02d}", word_count=1000, sections=2, size_pad=0)

        result = eval_content(chapters, total_chapters=10)

        # coverage: 7*15//10 = 10
        assert result.breakdown["coverage"] == 10
        # volume: 4 meet criteria out of 7: 4*15//7 = 8
        assert result.breakdown["volume"] == 8
        # depth_a: 4*5//7 = 2
        # depth_b: 4*5//7 = 2 (only 4 have >=5 sections)
        assert result.breakdown["depth"] == 4
        assert result.score == 10 + 8 + 4  # 22

    def test_fixture_1_of_1_minimal(self, tmp_path):
        chapters = tmp_path / "chapters"
        chapters.mkdir()
        _write_chapter(chapters, "ch01", word_count=500, sections=2, size_pad=0)

        result = eval_content(chapters, total_chapters=1)

        assert result.breakdown["coverage"] == 15  # 1*15//1
        assert result.breakdown["volume"] == 0     # file too small
        assert result.breakdown["depth"] == 0      # word count too low, sections < 4
        assert result.score == 15


class TestEvalVisualFixtures:
    """Fixture-based visual eval with known report.json inputs."""

    def _make_report(self, **overrides) -> dict:
        base = {
            "pages": {
                "home": {
                    "metrics": {
                        "hasSidebar": True,
                        "hasDarkModeToggle": True,
                        "cardCount": 10,
                        "bodyText": 500,
                        "linkCount": 20,
                        "navItemCount": 16,
                    },
                    "diagnostics": {
                        "mermaid": {"jsLoaded": True, "containersFound": 5, "svgsRendered": 5, "renderErrors": [], "consoleErrors": []},
                    },
                    "errors": [],
                    "categorizedErrors": {"mermaid": [], "shiki": [], "search": [], "other": []},
                },
                "chapter-ch01": {
                    "metrics": {"codeBlockCount": 5, "mermaidCount": 3, "mermaidErrorCount": 0},
                    "diagnostics": {
                        "mermaid": {"jsLoaded": True, "containersFound": 3, "svgsRendered": 3, "renderErrors": [], "consoleErrors": []},
                        "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": True, "highlightedBlockCount": 5},
                    },
                    "errors": [],
                },
            },
            "summary": {
                "totalPages": 2,
                "pagesWithErrors": 0,
                "totalErrors": 0,
                "totalMermaidErrors": 0,
                "totalMermaidRendered": 3,
            },
        }
        for k, v in overrides.items():
            if isinstance(v, dict) and isinstance(base.get(k), dict):
                base[k].update(v)
            else:
                base[k] = v
        return base

    def test_perfect_visual_score(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path, self._make_report())

        result = eval_visual(tmp_path / "webapp", report)

        assert result.breakdown["build"] == 10
        assert result.breakdown["no_errors"] == 10  # 0 errors
        assert result.breakdown["mermaid"] == 8      # rendered > 0, no errors
        assert result.breakdown["layout"] == 7       # sidebar + dark + cards>5 + body>200
        assert result.score == 35

    def test_high_error_count_capped(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = self._make_report()
        report["summary"]["totalErrors"] = 10
        report_path = _write_report(tmp_path, report)

        result = eval_visual(tmp_path / "webapp", report_path)

        # no_errors: max(0, 10 - 10*2) = 0
        assert result.breakdown["no_errors"] == 0


class TestEvalInteractionFixtures:
    """Fixture-based interaction eval with known report.json inputs."""

    def test_perfect_interaction_score(self, tmp_path):
        report = {
            "pages": {
                "home": {
                    "metrics": {
                        "hasSidebar": True,
                        "navItemCount": 16,
                        "linkCount": 20,
                        "codeBlockCount": 0,
                    },
                    "diagnostics": {},
                    "errors": [],
                },
                "search": {
                    "metrics": {
                        "hasSearchInput": True,
                        "cardCount": 5,
                        "codeBlockCount": 0,
                    },
                    "diagnostics": {
                        "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5},
                    },
                    "errors": [],
                },
                "chapter-ch01": {
                    "metrics": {"codeBlockCount": 3},
                    "diagnostics": {
                        "codeBlock": {"preTagCount": 3, "codeTagCount": 3, "shikiClassesFound": True, "highlightedBlockCount": 3},
                    },
                    "errors": [],
                },
            },
            "summary": {"totalPages": 3, "pagesWithErrors": 0, "totalErrors": 0},
        }
        report_path = _write_report(tmp_path, report)

        result = eval_interaction(report_path)

        assert result.breakdown["search"] == 8        # input + cards > 0
        assert result.breakdown["navigation"] == 7    # sidebar(3) + navItems>10(2) + links>10(2)
        assert result.breakdown["code_highlight"] == 5
        assert result.breakdown["page_routing"] == 5   # 0 pages with errors
        assert result.score == 25

    def test_no_search_no_code(self, tmp_path):
        report = {
            "pages": {
                "home": {
                    "metrics": {"hasSidebar": False, "navItemCount": 0, "linkCount": 0, "codeBlockCount": 0},
                    "diagnostics": {},
                },
                "search": {
                    "metrics": {"hasSearchInput": False, "cardCount": 0},
                    "diagnostics": {"search": {"inputFound": False}},
                },
            },
            "summary": {"pagesWithErrors": 2},
        }
        report_path = _write_report(tmp_path, report)

        result = eval_interaction(report_path)

        assert result.breakdown["search"] == 0
        assert result.breakdown["navigation"] == 0
        assert result.breakdown["code_highlight"] == 0
        assert result.breakdown["page_routing"] == 3  # max(0, 5-2)
        assert result.score == 3


class TestMergeScoresFixture:
    """Verify merge arithmetic and feedback format on fixed inputs."""

    def test_merge_known_values(self, tmp_path):
        chapters = tmp_path / "chapters"
        chapters.mkdir()
        for i in range(5):
            _write_chapter(chapters, f"ch{i:02d}", word_count=4000, sections=6, size_pad=12000)

        content = eval_content(chapters, total_chapters=5)
        assert content.score == 40

        # Use a pre-built report for visual/interaction
        report = {
            "pages": {
                "home": {
                    "metrics": {
                        "hasSidebar": True, "hasDarkModeToggle": True,
                        "cardCount": 10, "bodyText": 500, "linkCount": 20, "navItemCount": 16,
                    },
                    "diagnostics": {"mermaid": {"jsLoaded": True, "containersFound": 5, "svgsRendered": 5, "renderErrors": [], "consoleErrors": []}},
                    "errors": [],
                    "categorizedErrors": {"mermaid": [], "shiki": [], "search": [], "other": []},
                },
                "search": {
                    "metrics": {"hasSearchInput": True, "cardCount": 5, "codeBlockCount": 0, "linkCount": 10, "navItemCount": 16},
                    "diagnostics": {"search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5}},
                },
                "chapter-ch01": {
                    "metrics": {"codeBlockCount": 3, "mermaidCount": 3, "mermaidErrorCount": 0},
                    "diagnostics": {
                        "mermaid": {"jsLoaded": True, "containersFound": 3, "svgsRendered": 3, "renderErrors": [], "consoleErrors": []},
                        "codeBlock": {"preTagCount": 3, "codeTagCount": 3, "shikiClassesFound": True, "highlightedBlockCount": 3},
                    },
                },
            },
            "summary": {"totalPages": 3, "pagesWithErrors": 0, "totalErrors": 0, "totalMermaidErrors": 0, "totalMermaidRendered": 3},
        }

        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report_path = _write_report(tmp_path, report)

        visual = eval_visual(tmp_path / "webapp", report_path)
        interaction = eval_interaction(report_path)

        merged = merge_scores(content, visual, interaction)

        assert merged.score == content.score + visual.score + interaction.score
        assert merged.scores.content == content.score
        assert merged.scores.visual == visual.score
        assert merged.scores.interaction == interaction.score

        feedback = merged.format_feedback()
        assert f"总分: {merged.score}/100" in feedback
        assert f"内容: {content.score}/40" in feedback

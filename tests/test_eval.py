"""Tests for pyharness.eval — deterministic scoring + diagnostics."""

import json
import tempfile
from pathlib import Path

import pytest

from pyharness.eval import eval_content, eval_visual, eval_interaction, merge_scores


# ── Fixtures ──

@pytest.fixture
def tmp_chapters(tmp_path: Path):
    """Create sample chapter JSON files."""
    chapters = tmp_path / "chapters"
    chapters.mkdir()
    return chapters


def _write_chapter(chapters_dir: Path, chapter_id: str, word_count: int = 3500, sections: int = 5, size_pad: int = 0):
    data = {
        "chapter_id": chapter_id,
        "title": f"Chapter {chapter_id}",
        "subtitle": "test",
        "sections": [{"heading": f"s{i}", "content": "x" * 200} for i in range(sections)],
        "key_takeaways": ["a", "b", "c"],
        "word_count": word_count,
    }
    text = json.dumps(data, ensure_ascii=False)
    if size_pad > 0:
        data["_pad"] = "x" * size_pad
        text = json.dumps(data, ensure_ascii=False)
    path = chapters_dir / f"{chapter_id}.json"
    path.write_text(text)
    return path


def _write_report(tmp_path: Path, overrides: dict | None = None) -> Path:
    report = {
        "pages": {
            "home": {
                "metrics": {
                    "hasSidebar": True,
                    "hasDarkModeToggle": True,
                    "cardCount": 10,
                    "bodyText": 500,
                    "linkCount": 20,
                    "navItemCount": 16,
                    "codeBlockCount": 0,
                    "mermaidCount": 0,
                    "mermaidErrorCount": 0,
                    "hasSearchInput": False,
                },
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 0, "svgsRendered": 0, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {"inputFound": False, "queryTyped": False, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
                "errors": [],
                "categorizedErrors": {"mermaid": [], "shiki": [], "search": [], "other": []},
            },
            "search": {
                "metrics": {
                    "hasSearchInput": True,
                    "cardCount": 0,
                    "codeBlockCount": 0,
                    "linkCount": 10,
                    "navItemCount": 16,
                    "mermaidCount": 0,
                    "mermaidErrorCount": 0,
                },
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 0, "svgsRendered": 0, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
                "errors": [],
            },
            "chapter-ch01": {
                "metrics": {"codeBlockCount": 0, "mermaidCount": 0, "mermaidErrorCount": 0},
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 2, "svgsRendered": 0, "renderErrors": ["parse error"], "consoleErrors": ["mermaid error"]},
                    "codeBlock": {"preTagCount": 3, "codeTagCount": 5, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {"inputFound": False, "queryTyped": False, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
                "errors": ["mermaid error"],
            },
        },
        "summary": {
            "totalPages": 3,
            "pagesWithErrors": 1,
            "totalErrors": 1,
            "totalMermaidErrors": 0,
            "totalMermaidRendered": 0,
        },
    }
    if overrides:
        _deep_merge(report, overrides)
    path = tmp_path / "report.json"
    path.write_text(json.dumps(report))
    return path


def _deep_merge(base: dict, updates: dict):
    for k, v in updates.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


# ── eval_content tests ──

class TestEvalContent:
    def test_full_coverage(self, tmp_chapters):
        for i in range(5):
            _write_chapter(tmp_chapters, f"ch{i:02d}", word_count=4000, sections=6, size_pad=12000)
        result = eval_content(tmp_chapters, total_chapters=5)
        assert result.score == 40
        assert result.breakdown["coverage"] == 15
        assert result.breakdown["volume"] == 15
        assert result.breakdown["depth"] == 10
        assert result.issues == []

    def test_partial_coverage(self, tmp_chapters):
        for i in range(3):
            _write_chapter(tmp_chapters, f"ch{i:02d}", word_count=4000, sections=6, size_pad=8000)
        result = eval_content(tmp_chapters, total_chapters=10)
        assert result.breakdown["coverage"] == 4  # 3*15//10

    def test_empty_chapters(self, tmp_chapters):
        result = eval_content(tmp_chapters, total_chapters=10)
        assert result.score == 0
        assert result.breakdown["coverage"] == 0
        assert len(result.issues) > 0

    def test_zero_total_chapters(self, tmp_chapters):
        result = eval_content(tmp_chapters, total_chapters=0)
        assert result.score == 0

    def test_low_word_count(self, tmp_chapters):
        _write_chapter(tmp_chapters, "ch01", word_count=1000, sections=3, size_pad=8000)
        result = eval_content(tmp_chapters, total_chapters=1)
        assert result.breakdown["coverage"] == 15
        assert result.breakdown["depth"] == 0

    def test_small_file_size(self, tmp_chapters):
        _write_chapter(tmp_chapters, "ch01", word_count=4000, sections=5, size_pad=0)
        result = eval_content(tmp_chapters, total_chapters=1)
        assert result.breakdown["coverage"] == 15

    def test_nonexistent_dir(self):
        result = eval_content(Path("/nonexistent"), total_chapters=5)
        assert result.score == 0


# ── eval_visual tests ──

class TestEvalVisual:
    def test_no_build(self, tmp_path):
        report = _write_report(tmp_path)
        result = eval_visual(tmp_path / "webapp", report)
        assert result.breakdown["build"] == 0

    def test_with_build(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path)
        result = eval_visual(tmp_path / "webapp", report)
        assert result.breakdown["build"] == 10

    def test_console_errors_deduction(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path, {"summary": {"totalErrors": 3}})
        result = eval_visual(tmp_path / "webapp", report)
        assert result.breakdown["no_errors"] == 4  # 10 - 3*2

    def test_mermaid_diagnostics_js_not_loaded(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path)
        result = eval_visual(tmp_path / "webapp", report)
        assert result.breakdown["mermaid"] == 0
        mermaid_issues = [i for i in result.issues if "MermaidDiagram.tsx" in i]
        assert len(mermaid_issues) > 0
        assert "jsLoaded=false" in mermaid_issues[0] or "未加载" in mermaid_issues[0]

    def test_mermaid_containers_but_no_svg(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path, {
            "pages": {"chapter-ch01": {"diagnostics": {"mermaid": {
                "jsLoaded": True, "containersFound": 3, "svgsRendered": 0, "renderErrors": ["bad syntax"], "consoleErrors": [],
            }}}},
        })
        result = eval_visual(tmp_path / "webapp", report)
        mermaid_issues = [i for i in result.issues if "MermaidDiagram.tsx" in i]
        assert any("容器" in i and "SVG" in i for i in mermaid_issues)

    def test_layout_score(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        report = _write_report(tmp_path)
        result = eval_visual(tmp_path / "webapp", report)
        assert result.breakdown["layout"] == 7

    def test_no_report(self, tmp_path):
        (tmp_path / "webapp" / "out").mkdir(parents=True)
        result = eval_visual(tmp_path / "webapp", tmp_path / "nonexistent.json")
        assert result.breakdown["build"] == 10
        assert result.breakdown["no_errors"] == 10
        assert result.breakdown["mermaid"] == 0
        assert result.breakdown["layout"] == 0


# ── eval_interaction tests ──

class TestEvalInteraction:
    def test_search_input_no_results(self, tmp_path):
        report = _write_report(tmp_path)
        result = eval_interaction(report)
        assert result.breakdown["search"] == 4
        search_issues = [i for i in result.issues if "SearchClient.tsx" in i]
        assert len(search_issues) > 0

    def test_code_blocks_pre_but_no_shiki(self, tmp_path):
        report = _write_report(tmp_path)
        result = eval_interaction(report)
        assert result.breakdown["code_highlight"] == 0
        code_issues = [i for i in result.issues if "CodeBlock.tsx" in i]
        assert len(code_issues) > 0
        assert any("shiki" in i or "<pre>" in i for i in code_issues)

    def test_full_interaction(self, tmp_path):
        report = _write_report(tmp_path, {
            "summary": {"pagesWithErrors": 0},
            "pages": {
                "search": {"metrics": {"hasSearchInput": True, "cardCount": 5}},
                "chapter-ch01": {
                    "metrics": {"codeBlockCount": 3},
                    "diagnostics": {"codeBlock": {"preTagCount": 3, "codeTagCount": 3, "shikiClassesFound": True, "highlightedBlockCount": 3}},
                },
            },
        })
        result = eval_interaction(report)
        assert result.breakdown["search"] == 8
        assert result.breakdown["code_highlight"] == 5
        assert result.breakdown["page_routing"] == 5

    def test_no_report(self, tmp_path):
        result = eval_interaction(tmp_path / "nonexistent.json")
        assert result.score == 5  # page_routing=5 (0 errors = full marks)

    def test_navigation_scoring(self, tmp_path):
        report = _write_report(tmp_path)
        result = eval_interaction(report)
        assert result.breakdown["navigation"] == 7


# ── merge_scores tests ──

class TestMergeScores:
    def test_merge(self, tmp_path):
        c = eval_content(tmp_path, 0)
        v = eval_visual(tmp_path, tmp_path / "x.json")
        i = eval_interaction(tmp_path / "x.json")
        m = merge_scores(c, v, i)
        assert m.score == c.score + v.score + i.score
        assert m.scores.content == c.score
        assert m.scores.visual == v.score
        assert m.scores.interaction == i.score

    def test_feedback_format(self, tmp_path):
        c = eval_content(tmp_path, 0)
        v = eval_visual(tmp_path, tmp_path / "x.json")
        i = eval_interaction(tmp_path / "x.json")
        m = merge_scores(c, v, i)
        feedback = m.format_feedback()
        assert "总分" in feedback
        assert "内容" in feedback
        assert "视觉" in feedback
        assert "交互" in feedback


# ── Real data tests (using actual project files) ──

class TestRealData:
    @pytest.fixture
    def real_chapters(self):
        p = Path("knowledge/Pydantic AI/chapters")
        if not p.exists():
            pytest.skip("No real chapter data available")
        return p

    @pytest.fixture
    def real_report(self):
        p = Path("output/screenshots/report.json")
        if not p.exists():
            pytest.skip("No real report data available")
        return p

    def test_real_content_eval(self, real_chapters):
        result = eval_content(real_chapters, 18)
        assert 0 <= result.score <= 40
        assert result.breakdown["coverage"] >= 0

    def test_real_visual_eval(self, real_report):
        result = eval_visual(Path("web-app"), real_report)
        assert 0 <= result.score <= 35
        has_component_issues = any("[web-app/" in i for i in result.issues)
        if result.breakdown["mermaid"] < 8:
            assert has_component_issues, "Mermaid issues should reference component file path"

    def test_real_interaction_eval(self, real_report):
        result = eval_interaction(real_report)
        assert 0 <= result.score <= 25
        has_component_issues = any("[web-app/" in i for i in result.issues)
        if result.breakdown["code_highlight"] == 0:
            assert has_component_issues, "Code issues should reference component file path"

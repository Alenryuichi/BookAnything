"""Tests for pyharness.phases.improve — structured diagnostic blocks."""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from pyharness.phases.improve import _build_diagnostic_blocks, _fallback_diagnostics


def _make_runner(harness_dir: Path, webapp_dir: Path | None = None):
    runner = MagicMock()
    runner.harness_dir = harness_dir
    runner.webapp_dir = webapp_dir or harness_dir / "web-app"
    return runner


def _write_report(path: Path, pages: dict | None = None):
    report = {
        "pages": pages or {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 0, "svgsRendered": 0, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {"inputFound": False, "queryTyped": False, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
            },
            "search": {
                "diagnostics": {
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
            },
        },
        "summary": {},
    }
    screenshots_dir = path / "output" / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    (screenshots_dir / "report.json").write_text(json.dumps(report))


class TestDiagnosticBlocks:
    def test_all_broken(self, tmp_path):
        _write_report(tmp_path)
        runner = _make_runner(tmp_path)
        blocks = _build_diagnostic_blocks(runner)
        parsed = json.loads(blocks)
        assert len(parsed) >= 2
        components = [b["component"] for b in parsed]
        assert "MermaidDiagram" in components
        assert "CodeBlock" in components

    def test_mermaid_js_not_loaded(self, tmp_path):
        _write_report(tmp_path)
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))
        mermaid = next(b for b in blocks if b["component"] == "MermaidDiagram")
        assert mermaid["status"] == "broken"
        assert "未加载" in mermaid["diagnosis"]
        assert mermaid["file"] == "web-app/components/MermaidDiagram.tsx"
        assert "8 points" in mermaid["score_impact"]

    def test_mermaid_containers_no_svg(self, tmp_path):
        _write_report(tmp_path, {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": True, "containersFound": 3, "svgsRendered": 0, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": True, "highlightedBlockCount": 5},
                    "search": {},
                },
            },
            "search": {"diagnostics": {"search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5}}},
        })
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))
        mermaid = next(b for b in blocks if b["component"] == "MermaidDiagram")
        assert "容器" in mermaid["diagnosis"]

    def test_code_pre_no_shiki(self, tmp_path):
        _write_report(tmp_path, {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": True, "containersFound": 2, "svgsRendered": 2, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {},
                },
            },
            "search": {"diagnostics": {"search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5}}},
        })
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))
        code = next(b for b in blocks if b["component"] == "CodeBlock")
        assert code["status"] == "partial"
        assert "shiki" in code["diagnosis"]

    def test_everything_working(self, tmp_path):
        _write_report(tmp_path, {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": True, "containersFound": 2, "svgsRendered": 2, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": True, "highlightedBlockCount": 5},
                    "search": {},
                },
            },
            "search": {"diagnostics": {"search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5}}},
        })
        runner = _make_runner(tmp_path)
        blocks = _build_diagnostic_blocks(runner)
        assert blocks == ""

    def test_no_report(self, tmp_path):
        runner = _make_runner(tmp_path)
        blocks = _build_diagnostic_blocks(runner)
        parsed = json.loads(blocks)
        assert len(parsed) == 3
        assert all(b["status"] == "unknown" for b in parsed)

    def test_fallback(self):
        blocks = json.loads(_fallback_diagnostics())
        assert len(blocks) == 3
        components = {b["component"] for b in blocks}
        assert components == {"MermaidDiagram", "CodeBlock", "SearchClient"}

    def test_ordered_by_score_impact(self, tmp_path):
        _write_report(tmp_path)
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))
        if len(blocks) >= 2:
            assert blocks[0]["component"] == "MermaidDiagram"

"""Signal loop integrity — verify eval → improve diagnostic propagation.

These tests ensure that when a component is broken in report.json, the
eval issues propagate correctly through diagnostic blocks into the improve
prompt. The signal chain: report → eval → diagnostic blocks → improve prompt.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pyharness.eval import eval_visual, eval_interaction
from pyharness.phases.improve import _build_diagnostic_blocks


def _make_runner(harness_dir: Path) -> MagicMock:
    runner = MagicMock()
    runner.harness_dir = harness_dir
    runner.webapp_dir = harness_dir / "web-app"
    return runner


def _write_report(harness_dir: Path, report: dict) -> Path:
    screenshots_dir = harness_dir / "output" / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    path = screenshots_dir / "report.json"
    path.write_text(json.dumps(report))
    return path


def _make_all_broken_report() -> dict:
    """Report where mermaid, code, and search are all broken."""
    return {
        "pages": {
            "home": {
                "metrics": {
                    "hasSidebar": True, "hasDarkModeToggle": True,
                    "cardCount": 10, "bodyText": 500,
                    "linkCount": 20, "navItemCount": 16,
                },
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 0, "svgsRendered": 0, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {"inputFound": False},
                },
                "errors": [],
                "categorizedErrors": {"mermaid": [], "shiki": [], "search": [], "other": []},
            },
            "search": {
                "metrics": {"hasSearchInput": True, "cardCount": 0},
                "diagnostics": {
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
            },
            "chapter-ch01": {
                "metrics": {"codeBlockCount": 0, "mermaidCount": 0, "mermaidErrorCount": 0},
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 0, "svgsRendered": 0, "renderErrors": [], "consoleErrors": ["mermaid is not defined"]},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {},
                },
            },
        },
        "summary": {"totalPages": 3, "pagesWithErrors": 0, "totalErrors": 0, "totalMermaidErrors": 0, "totalMermaidRendered": 0},
    }


def _make_mermaid_broken_report() -> dict:
    """Report where only mermaid is broken."""
    return {
        "pages": {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": False, "containersFound": 2, "svgsRendered": 0, "renderErrors": ["parse error"], "consoleErrors": ["mermaid is not defined"]},
                    "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": True, "highlightedBlockCount": 5},
                    "search": {},
                },
            },
            "search": {
                "diagnostics": {
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5},
                },
            },
        },
        "summary": {"totalPages": 2, "pagesWithErrors": 0, "totalErrors": 0, "totalMermaidErrors": 0, "totalMermaidRendered": 0},
    }


def _make_code_broken_report() -> dict:
    """Report where only code blocks are broken."""
    return {
        "pages": {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": True, "containersFound": 2, "svgsRendered": 2, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 0, "codeTagCount": 0, "shikiClassesFound": False, "highlightedBlockCount": 0},
                    "search": {},
                },
            },
            "search": {
                "diagnostics": {
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 5, "cardCountAfterQuery": 5},
                },
            },
        },
        "summary": {"totalPages": 2, "pagesWithErrors": 0, "totalErrors": 0, "totalMermaidErrors": 0, "totalMermaidRendered": 2},
    }


def _make_search_broken_report() -> dict:
    """Report where only search is broken."""
    return {
        "pages": {
            "chapter-ch01": {
                "diagnostics": {
                    "mermaid": {"jsLoaded": True, "containersFound": 2, "svgsRendered": 2, "renderErrors": [], "consoleErrors": []},
                    "codeBlock": {"preTagCount": 5, "codeTagCount": 5, "shikiClassesFound": True, "highlightedBlockCount": 5},
                    "search": {},
                },
            },
            "search": {
                "diagnostics": {
                    "search": {"inputFound": True, "queryTyped": True, "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                },
            },
        },
        "summary": {"totalPages": 2, "pagesWithErrors": 0, "totalErrors": 0, "totalMermaidErrors": 0, "totalMermaidRendered": 2},
    }


class TestMermaidSignal:
    def test_mermaid_broken_produces_diagnostic(self, tmp_path: Path):
        _write_report(tmp_path, _make_mermaid_broken_report())
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))

        mermaid_block = next(b for b in blocks if b["component"] == "MermaidDiagram")
        assert mermaid_block["file"] == "web-app/components/MermaidDiagram.tsx"
        assert mermaid_block["status"] == "broken"
        assert "fix_hint" in mermaid_block
        assert "mermaid" in mermaid_block["fix_hint"].lower() or "dynamic import" in mermaid_block["fix_hint"]


class TestCodeBlockSignal:
    def test_code_broken_produces_diagnostic(self, tmp_path: Path):
        _write_report(tmp_path, _make_code_broken_report())
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))

        code_block = next(b for b in blocks if b["component"] == "CodeBlock")
        assert "CodeBlock.tsx" in code_block["file"]
        assert code_block["status"] == "broken"


class TestSearchSignal:
    def test_search_broken_produces_diagnostic(self, tmp_path: Path):
        _write_report(tmp_path, _make_search_broken_report())
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))

        search_block = next(b for b in blocks if b["component"] == "SearchClient")
        assert "SearchClient.tsx" in search_block["file"]
        assert search_block["status"] == "broken"


class TestBlockOrdering:
    def test_blocks_ordered_by_score_impact(self, tmp_path: Path):
        _write_report(tmp_path, _make_all_broken_report())
        runner = _make_runner(tmp_path)
        blocks = json.loads(_build_diagnostic_blocks(runner))

        assert len(blocks) >= 2, f"Expected >=2 blocks, got {len(blocks)}"
        components = [b["component"] for b in blocks]
        assert components[0] == "MermaidDiagram", "First block should be MermaidDiagram (8 points)"
        if "CodeBlock" in components and "SearchClient" in components:
            code_idx = components.index("CodeBlock")
            search_idx = components.index("SearchClient")
            assert code_idx < search_idx, "CodeBlock (5 pts) should come before SearchClient (4 pts)"


class TestFullSignalChain:
    @pytest.mark.asyncio
    async def test_report_to_improve_prompt_chain(self, tmp_path: Path):
        """Full chain: report → eval issues → diagnostic blocks → improve prompt."""
        report_data = _make_all_broken_report()
        _write_report(tmp_path, report_data)
        report_path = tmp_path / "output" / "screenshots" / "report.json"

        visual_eval = eval_visual(tmp_path / "no-webapp", report_path)
        interaction_eval = eval_interaction(report_path)
        all_issues = visual_eval.issues + interaction_eval.issues

        runner = _make_runner(tmp_path)
        blocks_json = _build_diagnostic_blocks(runner)
        blocks = json.loads(blocks_json)

        block_files = {b["file"] for b in blocks}
        assert "web-app/components/MermaidDiagram.tsx" in block_files
        assert "web-app/components/CodeBlock.tsx" in block_files
        assert "web-app/components/SearchClient.tsx" in block_files

        captured_prompt = None

        async def capture_run(prompt, **kwargs):
            nonlocal captured_prompt
            captured_prompt = prompt
            return "{}"

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = capture_run
            from pyharness.phases.improve import step_improve_webapp
            await step_improve_webapp(runner, iteration=1, last_eval_feedback="test")

        assert captured_prompt is not None
        assert "MermaidDiagram.tsx" in captured_prompt
        assert "CodeBlock.tsx" in captured_prompt
        assert "SearchClient.tsx" in captured_prompt

        for block in blocks:
            assert block.get("fix_hint"), f"Block {block['component']} missing fix_hint"

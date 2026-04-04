"""Prompt snapshot regression — verify key fragments survive prompt edits.

Instead of full-text snapshots (too brittle), we assert that each phase's
prompt contains critical structural elements. If a key fragment goes missing,
this test fails — forcing a review of whether the change was intentional.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pyharness.schemas import PlanOutput, ChapterToWrite


def _make_runner(tmp_path: Path, book_title: str = "测试书籍"):
    """Build a minimal mock runner for prompt extraction."""
    runner = MagicMock()
    runner.harness_dir = tmp_path
    runner.webapp_dir = tmp_path / "web-app"
    runner.chapters_dir = tmp_path / "chapters"
    runner.chapters_dir.mkdir(parents=True, exist_ok=True)
    runner.max_parallel = 2

    config = MagicMock()
    config.book_title = book_title
    config.name = "TestProject"
    config.language = "Python"
    config.description = "A test project"
    config.repo_path = "/tmp/test-repo"
    config.chapters = [
        MagicMock(id="ch01-intro", title="Introduction", subtitle="Getting started",
                  sources=["src/"], outline="Chapter outline here"),
    ]
    config.get_all_chapter_ids.return_value = ["ch01-intro"]
    config.get_chapter.return_value = config.chapters[0]
    runner.config = config
    return runner


class TestPlanPrompt:
    @pytest.mark.asyncio
    async def test_contains_key_fragments(self, tmp_path: Path):
        runner = _make_runner(tmp_path, book_title="深入理解 TestProject")
        captured_prompt = None

        async def capture_run(prompt, **kwargs):
            nonlocal captured_prompt
            captured_prompt = prompt
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch01-intro", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = capture_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=1, last_eval_feedback="无")

        assert captured_prompt is not None, "Plan prompt was not captured"
        assert "chapters_to_write" in captured_prompt, "Plan prompt missing 'chapters_to_write'"
        assert "improvement_focus" in captured_prompt, "Plan prompt missing 'improvement_focus'"
        assert "深入理解 TestProject" in captured_prompt, "Plan prompt missing book title"


class TestWritePrompt:
    @pytest.mark.asyncio
    async def test_contains_key_fragments(self, tmp_path: Path):
        runner = _make_runner(tmp_path, book_title="深入理解 TestProject")
        captured_prompt = None

        async def capture_run(prompt, **kwargs):
            nonlocal captured_prompt
            captured_prompt = prompt
            return '{"chapter_id": "ch01-intro", "title": "test", "sections": [], "word_count": 100}'

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = capture_run
            from pyharness.phases.write import _write_single_chapter
            await _write_single_chapter(runner, iteration=1, chapter_id="ch01-intro", focus="test")

        assert captured_prompt is not None, "Write prompt was not captured"
        assert "70%" in captured_prompt, "Write prompt missing '70%' text ratio"
        assert "opening_hook" in captured_prompt, "Write prompt missing 'opening_hook'"
        for frag in ["mermaid", "Mermaid"]:
            if frag in captured_prompt:
                break
        else:
            pytest.fail("Write prompt missing 'mermaid/Mermaid'")
        assert "3000-5000" in captured_prompt, "Write prompt missing '3000-5000' range"
        assert "Introduction" in captured_prompt, "Write prompt missing chapter title"


class TestImprovePrompt:
    @pytest.mark.asyncio
    async def test_contains_component_paths(self, tmp_path: Path):
        runner = _make_runner(tmp_path)
        captured_prompt = None

        async def capture_run(prompt, **kwargs):
            nonlocal captured_prompt
            captured_prompt = prompt
            return '{"changes_made": [], "files_modified": [], "issues_fixed": [], "issues_remaining": []}'

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = capture_run
            from pyharness.phases.improve import step_improve_webapp
            await step_improve_webapp(runner, iteration=1, last_eval_feedback="mermaid broken")

        assert captured_prompt is not None, "Improve prompt was not captured"
        assert "MermaidDiagram.tsx" in captured_prompt, "Improve prompt missing MermaidDiagram.tsx"
        assert "CodeBlock.tsx" in captured_prompt, "Improve prompt missing CodeBlock.tsx"
        assert "SearchClient.tsx" in captured_prompt, "Improve prompt missing SearchClient.tsx"

    @pytest.mark.asyncio
    async def test_diagnostic_driven_prompt_contains_diagnosis(self, tmp_path: Path):
        """When report.json has diagnostics, improve prompt includes specific diagnosis text."""
        runner = _make_runner(tmp_path)
        screenshots_dir = tmp_path / "output" / "screenshots"
        screenshots_dir.mkdir(parents=True)
        import json
        report = {
            "pages": {
                "chapter-ch01": {
                    "diagnostics": {
                        "mermaid": {"jsLoaded": True, "containersFound": 3, "svgsRendered": 0,
                                    "renderErrors": ["parse error"], "consoleErrors": []},
                        "codeBlock": {"preTagCount": 0, "codeTagCount": 0,
                                      "shikiClassesFound": False, "highlightedBlockCount": 0},
                        "search": {},
                    },
                },
                "search": {
                    "diagnostics": {
                        "search": {"inputFound": True, "queryTyped": True,
                                   "resultsAfterQuery": 0, "cardCountAfterQuery": 0},
                    },
                },
            },
            "summary": {},
        }
        (screenshots_dir / "report.json").write_text(json.dumps(report))

        captured_prompt = None

        async def capture_run(prompt, **kwargs):
            nonlocal captured_prompt
            captured_prompt = prompt
            return '{"changes_made": [], "files_modified": [], "issues_fixed": [], "issues_remaining": []}'

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = capture_run
            from pyharness.phases.improve import step_improve_webapp
            await step_improve_webapp(runner, iteration=1, last_eval_feedback="")

        assert captured_prompt is not None
        assert "容器" in captured_prompt or "containers" in captured_prompt, \
            "Diagnostic-driven prompt should mention containers when mermaid has containers but no SVGs"
        assert "8 points" in captured_prompt, "Prompt should show mermaid score impact"

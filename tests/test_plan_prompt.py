"""Task 6.4: Verify plan prompt content structure.

Since run.sh no longer exists, we test that the Python plan phase produces
prompts with all required sections and data injection. Uses a mock
ClaudeClient to capture the prompt text without making real API calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from pyharness.config import BookConfig, ChapterConfig, ProjectConfig
from pyharness.runner import HarnessRunner
from pyharness.schemas import ChapterToWrite, PlanOutput


def _make_config() -> ProjectConfig:
    return ProjectConfig(
        name="TestProject",
        repo_path="/tmp/test",
        target_dir="src",
        language="Python",
        description="A test project for unit testing",
        book=BookConfig(title="深入理解 TestProject"),
        chapters=[
            ChapterConfig(id="ch01-intro", title="Introduction", subtitle="Getting Started"),
            ChapterConfig(id="ch02-core", title="Core System", subtitle="Architecture"),
            ChapterConfig(id="ch03-api", title="API Layer", subtitle="REST endpoints"),
        ],
    )


@pytest.fixture
def runner(tmp_path):
    config = _make_config()
    r = HarnessRunner(config=config, max_hours=1, threshold=85, max_parallel=2, resume=False)
    r.harness_dir = tmp_path
    r.knowledge_dir = tmp_path / "knowledge" / "TestProject"
    r.chapters_dir = r.knowledge_dir / "chapters"
    r.chapters_dir.mkdir(parents=True)
    r.log_dir = tmp_path / "output" / "logs"
    r.webapp_dir = tmp_path / "web-app"
    r.lock_file = tmp_path / ".harness.lock"
    r.state.path = tmp_path / "state.json"
    return r


class TestPlanPromptContent:
    """Verify the plan prompt includes all required context."""

    @pytest.mark.asyncio
    async def test_prompt_contains_book_title(self, runner):
        captured_prompts: list[str] = []

        async def fake_run(prompt, **kwargs):
            captured_prompts.append(prompt)
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch01-intro", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fake_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=1, last_eval_feedback="")

        assert len(captured_prompts) == 1
        prompt = captured_prompts[0]
        assert "深入理解 TestProject" in prompt

    @pytest.mark.asyncio
    async def test_prompt_contains_chapter_listing(self, runner):
        captured_prompts: list[str] = []

        async def fake_run(prompt, **kwargs):
            captured_prompts.append(prompt)
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch01-intro", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fake_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=1, last_eval_feedback="")

        prompt = captured_prompts[0]
        assert "ch01-intro" in prompt
        assert "ch02-core" in prompt
        assert "ch03-api" in prompt
        assert "Introduction" in prompt
        assert "Core System" in prompt

    @pytest.mark.asyncio
    async def test_prompt_includes_existing_chapters(self, runner):
        ch_data = {"chapter_id": "ch01-intro", "title": "Introduction", "sections": []}
        (runner.chapters_dir / "ch01-intro.json").write_text(json.dumps(ch_data))

        captured_prompts: list[str] = []

        async def fake_run(prompt, **kwargs):
            captured_prompts.append(prompt)
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch02-core", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fake_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=2, last_eval_feedback="Score: 50")

        prompt = captured_prompts[0]
        assert "ch01-intro" in prompt
        assert "迭代: 2" in prompt

    @pytest.mark.asyncio
    async def test_prompt_includes_eval_feedback(self, runner):
        captured_prompts: list[str] = []
        feedback_text = "总分: 65/100 | 内容: 30/40 | 视觉: 20/35 | 交互: 15/25"

        async def fake_run(prompt, **kwargs):
            captured_prompts.append(prompt)
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch01-intro", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fake_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=3, last_eval_feedback=feedback_text)

        prompt = captured_prompts[0]
        assert feedback_text in prompt

    @pytest.mark.asyncio
    async def test_fallback_when_claude_fails(self, runner):
        """When Claude fails, fallback returns unwritten chapters."""
        async def fail_run(prompt, **kwargs):
            raise RuntimeError("API error")

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fail_run
            from pyharness.phases.plan import step_plan
            result = await step_plan(runner, iteration=1, last_eval_feedback="")

        assert result is not None
        assert len(result.chapters_to_write) > 0
        chapter_ids = [c.id for c in result.chapters_to_write]
        assert "ch01-intro" in chapter_ids

    @pytest.mark.asyncio
    async def test_fallback_excludes_written_chapters(self, runner):
        """Fallback should only include chapters not yet written."""
        ch_data = {"chapter_id": "ch01-intro", "title": "Introduction", "sections": []}
        (runner.chapters_dir / "ch01-intro.json").write_text(json.dumps(ch_data))

        async def fail_run(prompt, **kwargs):
            raise RuntimeError("API error")

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fail_run
            from pyharness.phases.plan import step_plan
            result = await step_plan(runner, iteration=2, last_eval_feedback="")

        chapter_ids = [c.id for c in result.chapters_to_write]
        assert "ch01-intro" not in chapter_ids
        assert "ch02-core" in chapter_ids

    @pytest.mark.asyncio
    async def test_prompt_requests_json_output(self, runner):
        captured_prompts: list[str] = []

        async def fake_run(prompt, **kwargs):
            captured_prompts.append(prompt)
            return PlanOutput(
                plan_summary="test",
                chapters_to_write=[ChapterToWrite(id="ch01-intro", focus="test")],
            )

        with patch("pyharness.claude_client.ClaudeClient") as MockClient:
            MockClient.return_value.run = fake_run
            from pyharness.phases.plan import step_plan
            await step_plan(runner, iteration=1, last_eval_feedback="")

        prompt = captured_prompts[0]
        assert "JSON" in prompt

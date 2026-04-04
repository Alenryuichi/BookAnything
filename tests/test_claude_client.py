"""Tests for pyharness.claude_client — CLI contract + JSON parsing."""

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from pyharness.claude_client import ClaudeClient
from pyharness.schemas import PlanOutput


FIXTURES = Path(__file__).parent / "fixtures"


def _mock_process(stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
    """Create a mock process that behaves like asyncio.subprocess.Process."""
    proc = AsyncMock()
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    proc.returncode = returncode
    return proc


# ── _extract_json tests ──

class TestExtractJson:
    def test_pure_json(self):
        assert ClaudeClient._extract_json('{"score": 42}') == '{"score": 42}'

    def test_markdown_fenced(self):
        result = ClaudeClient._extract_json('```json\n{"score": 42}\n```')
        assert json.loads(result) == {"score": 42}

    def test_markdown_fenced_no_lang(self):
        result = ClaudeClient._extract_json('```\n{"score": 42}\n```')
        assert json.loads(result) == {"score": 42}

    def test_prose_prefix(self):
        result = ClaudeClient._extract_json('Here is the result:\n{"score": 42}')
        assert json.loads(result) == {"score": 42}

    def test_prose_suffix(self):
        result = ClaudeClient._extract_json('{"score": 42}\n\nDone!')
        assert json.loads(result) == {"score": 42}

    def test_empty_string(self):
        assert ClaudeClient._extract_json("") is None

    def test_no_json(self):
        assert ClaudeClient._extract_json("no json here at all") is None

    def test_nested_braces(self):
        text = '{"a": {"b": 1}, "c": 2}'
        result = ClaudeClient._extract_json(text)
        assert json.loads(result) == {"a": {"b": 1}, "c": 2}

    def test_whitespace_only(self):
        assert ClaudeClient._extract_json("   \n\t  ") is None


# ── Argv assembly tests ──

class TestArgvAssembly:
    @pytest.mark.asyncio
    async def test_default_args(self):
        proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        captured_args = {}

        async def fake_exec(*args, **kwargs):
            captured_args["args"] = args
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            await client.run(prompt="test prompt", allowed_tools=["Read", "Grep"])

        args = captured_args["args"]
        assert args[0] == "claude"
        assert args[1] == "-p"
        assert "test prompt" in args
        assert "--output-format" in args
        # allowed_tools accepted but NOT forwarded to CLI (enforced by .claude/rules/)
        assert "--allowedTools" not in args

    @pytest.mark.asyncio
    async def test_no_allowed_tools(self):
        proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        captured_args = {}

        async def fake_exec(*args, **kwargs):
            captured_args["args"] = args
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            await client.run(prompt="test")

        assert "--allowedTools" not in captured_args["args"]

    @pytest.mark.asyncio
    async def test_custom_cmd(self):
        proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        captured_args = {}

        async def fake_exec(*args, **kwargs):
            captured_args["args"] = args
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude-internal", timeout=9999)
            await client.run(prompt="test")

        assert captured_args["args"][0] == "claude-internal"

    @pytest.mark.asyncio
    async def test_custom_max_turns(self):
        proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        captured_args = {}

        async def fake_exec(*args, **kwargs):
            captured_args["args"] = args
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            await client.run(prompt="test", max_turns=50)

        args = list(captured_args["args"])
        idx = args.index("--max-turns")
        assert args[idx + 1] == "50"


# ── Response model tests ──

class TestResponseModel:
    @pytest.mark.asyncio
    async def test_valid_plan_output(self):
        plan_json = '{"plan_summary":"test","chapters_to_write":[],"needs_webapp_improve":false}'
        envelope = json.dumps({"type": "result", "result": plan_json})
        proc = _mock_process(stdout=envelope.encode())

        async def fake_exec(*args, **kwargs):
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            result = await client.run(prompt="plan", response_model=PlanOutput)

        assert isinstance(result, PlanOutput)
        assert result.plan_summary == "test"
        assert result.needs_webapp_improve is False

    @pytest.mark.asyncio
    async def test_invalid_response_for_model(self):
        envelope = json.dumps({"type": "result", "result": "not json at all"})
        proc = _mock_process(stdout=envelope.encode())

        async def fake_exec(*args, **kwargs):
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            with pytest.raises(ValueError):
                await client.run(prompt="plan", response_model=PlanOutput)


# ── Error handling tests ──

class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_cli_error_raises(self):
        proc = _mock_process(stdout=b"", stderr=b"auth failed", returncode=1)

        async def fake_exec(*args, **kwargs):
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            with pytest.raises(RuntimeError, match="auth failed"):
                await client.run(prompt="test")


# ── Real fixture parsing tests ──

class TestFixtureParsing:
    @pytest.mark.asyncio
    async def test_parse_plan_fixture(self):
        fixture_path = FIXTURES / "cli_plan_response.json"
        if not fixture_path.exists():
            pytest.skip("No plan fixture")

        proc = _mock_process(stdout=fixture_path.read_bytes())

        async def fake_exec(*args, **kwargs):
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            result = await client.run(prompt="plan")

        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 10

    @pytest.mark.asyncio
    async def test_parse_chapter_fixture(self):
        fixture_path = FIXTURES / "cli_chapter_response.json"
        if not fixture_path.exists():
            pytest.skip("No chapter fixture")

        proc = _mock_process(stdout=fixture_path.read_bytes())

        async def fake_exec(*args, **kwargs):
            return proc

        with patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec):
            client = ClaudeClient(cmd="claude", timeout=9999)
            result = await client.run(prompt="write chapter")

        assert result is not None
        assert len(result) > 100

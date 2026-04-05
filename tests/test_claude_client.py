"""Tests for pyharness.claude_client — CLI contract + JSON parsing + retry."""

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch, call

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
            client = ClaudeClient(cmd="my-custom-claude", timeout=9999)
            await client.run(prompt="test")

        assert captured_args["args"][0] == "my-custom-claude"

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


# ── Retry tests ──

class TestRetry:
    @pytest.mark.asyncio
    async def test_succeeds_after_transient_failure(self):
        """Retry recovers from a single transient error."""
        fail_proc = _mock_process(stdout=b"", stderr=b"overloaded", returncode=1)
        ok_proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        call_count = 0

        async def fake_exec(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return fail_proc if call_count == 1 else ok_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=2, base_delay=1.0)
            result = await client.run(prompt="test")

        assert result == "ok"
        assert call_count == 2
        mock_sleep.assert_awaited_once_with(1.0)

    @pytest.mark.asyncio
    async def test_exponential_backoff_delays(self):
        """Backoff doubles each attempt: base_delay * 2^attempt."""
        fail_proc = _mock_process(stdout=b"", stderr=b"err", returncode=1)
        ok_proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        call_count = 0

        async def fake_exec(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return ok_proc if call_count == 3 else fail_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=2, base_delay=2.0)
            result = await client.run(prompt="test")

        assert result == "ok"
        assert mock_sleep.await_count == 2
        mock_sleep.assert_any_await(2.0)   # attempt 0: 2 * 2^0 = 2
        mock_sleep.assert_any_await(4.0)   # attempt 1: 2 * 2^1 = 4

    @pytest.mark.asyncio
    async def test_raises_after_all_retries_exhausted(self):
        """When all retries fail, the last error is raised."""
        fail_proc = _mock_process(stdout=b"", stderr=b"always fails", returncode=1)

        async def fake_exec(*args, **kwargs):
            return fail_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=1, base_delay=0.1)
            with pytest.raises(RuntimeError, match="always fails"):
                await client.run(prompt="test")

    @pytest.mark.asyncio
    async def test_no_retry_when_disabled(self):
        """max_retries=0 means single attempt, no retry."""
        fail_proc = _mock_process(stdout=b"", stderr=b"fail", returncode=1)
        call_count = 0

        async def fake_exec(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return fail_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=0, base_delay=1.0)
            with pytest.raises(RuntimeError):
                await client.run(prompt="test")

        assert call_count == 1
        mock_sleep.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_retries_on_empty_response(self):
        """Empty stdout triggers retry."""
        empty_proc = _mock_process(stdout=b"", stderr=b"", returncode=0)
        ok_proc = _mock_process(stdout=json.dumps({"type": "result", "result": "ok"}).encode())
        call_count = 0

        async def fake_exec(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return empty_proc if call_count == 1 else ok_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=1, base_delay=0.1)
            result = await client.run(prompt="test")

        assert result == "ok"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_retries_on_parse_failure_with_response_model(self):
        """response_model parse failure triggers retry."""
        bad_proc = _mock_process(stdout=json.dumps({"type": "result", "result": "not json"}).encode())
        good_json = '{"plan_summary":"ok","chapters_to_write":[],"needs_webapp_improve":false}'
        good_proc = _mock_process(stdout=json.dumps({"type": "result", "result": good_json}).encode())
        call_count = 0

        async def fake_exec(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return bad_proc if call_count == 1 else good_proc

        with (
            patch("pyharness.claude_client.asyncio.create_subprocess_exec", side_effect=fake_exec),
            patch("pyharness.claude_client.asyncio.sleep", new_callable=AsyncMock),
        ):
            client = ClaudeClient(cmd="claude", timeout=9999, max_retries=1, base_delay=0.1)
            result = await client.run(prompt="plan", response_model=PlanOutput)

        assert isinstance(result, PlanOutput)
        assert result.plan_summary == "ok"
        assert call_count == 2

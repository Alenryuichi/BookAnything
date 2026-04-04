"""Phase 4: Code review of webapp changes."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pyharness.log import log

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_code_review(runner: HarnessRunner, iteration: int) -> None:
    """Review webapp changes (read-only). Currently a no-op if no git diff."""
    import asyncio

    proc = await asyncio.create_subprocess_exec(
        "git", "diff", "--stat", "web-app/",
        cwd=str(runner.harness_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    diff = stdout.decode().strip()

    if not diff:
        log("INFO", "Code review: no webapp changes to review")
        return

    from pyharness.claude_client import ClaudeClient
    client = ClaudeClient(cwd=runner.harness_dir)

    result = await client.run(
        prompt=f"审查以下 web-app/ 改动，输出 JSON：\n```diff\n{diff}\n```",
        allowed_tools=["Read", "Glob", "Grep"],
        max_turns=10,
    )
    log("OK", "Code review completed")

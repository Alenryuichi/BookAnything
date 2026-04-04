"""Phase 3: Improve webapp based on evaluation feedback."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pyharness.log import log

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_improve_webapp(
    runner: HarnessRunner,
    iteration: int,
    last_eval_feedback: str,
) -> None:
    """Attempt to fix webapp issues based on eval feedback."""
    from pyharness.claude_client import ClaudeClient

    client = ClaudeClient(cwd=runner.harness_dir)

    prompt = f"""你是 Web 前端修复专家。根据评估反馈修复 Web App 的 bug。

## 限制
- 只能修改 {runner.webapp_dir}/ 下的文件
- 不要修改 knowledge/ 目录

## 上轮评估反馈
{last_eval_feedback or '无'}

## 输出纯 JSON
{{"changes_made": [], "files_modified": [], "issues_fixed": [], "issues_remaining": []}}"""

    result = await client.run(
        prompt=prompt,
        allowed_tools=["Read", "Glob", "Grep", "Write", "Edit"],
        max_turns=40,
    )
    log("OK", f"Webapp improve completed")

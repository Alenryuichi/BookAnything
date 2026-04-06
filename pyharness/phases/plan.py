"""Phase 1: Planning — decide which chapters to write next."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from pyharness.log import log
from pyharness.schemas import PlanOutput

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_plan(
    runner: HarnessRunner,
    iteration: int,
    last_eval_feedback: str,
) -> Optional[PlanOutput]:
    """Generate a plan for the current iteration using Claude."""
    from pyharness.claude_client import ClaudeClient

    client = ClaudeClient(cwd=runner.harness_dir)

    existing = [f.stem for f in runner.chapters_dir.glob("*.json")]
    all_ids = runner.config.get_all_chapter_ids()
    chapters_section = "\n".join(
        f"  - id: {ch.id}\n    title: {ch.title}" for ch in runner.config.chapters
    )

    # Build unresolved errors section if error_ledger available
    error_section = ""
    if hasattr(runner, "error_ledger") and runner.error_ledger:
        unresolved = runner.error_ledger.get_all_unresolved()
        if unresolved:
            lines = ["## Unresolved Errors from Previous Iterations",
                     "These chapters FAILED in previous attempts and MUST be retried:"]
            for err in unresolved:
                lines.append(
                    f"- {err['chapter_id']}: FAILED ({err['error_class']}, "
                    f"{err['attempt']}/{err['max_attempts']} attempts). "
                    f"Error: {err['error_message'][:100]}"
                )
            lines.append("")
            lines.append("You MUST include these failed chapters in chapters_to_write.")
            error_section = "\n".join(lines)

    prompt = f"""你是《{runner.config.book_title}》的编辑。制定下一轮写作计划。

## 当前状态
迭代: {iteration}
已写章节: {', '.join(existing) or 'none'}

## 上轮评估反馈
{last_eval_feedback or '无（第一轮）'}

{error_section}

## 书的章节目录
{chapters_section}

## 规则
1. 每轮选 2-3 个未写的章节并行撰写
2. 按章节顺序优先
3. 如果章节已存在但质量不够，可以选择重写
4. 如果有"Unresolved Errors"中的章节，必须优先重试

## 输出：纯 JSON
{{"plan_summary": "...", "chapters_to_write": [{{"id": "ch01-xxx", "focus": "..."}}], "needs_webapp_improve": true, "improvement_focus": "coverage"}}"""

    try:
        result = await client.run(
            prompt=prompt,
            allowed_tools=["Read", "Glob", "Grep"],
            max_turns=15,
            response_model=PlanOutput,
        )
        if result and result.chapters_to_write:
            log("OK", f"Plan: {[c.id for c in result.chapters_to_write]}")
            from pyharness.log import log_event
            log_event("plan_result", {
                "iteration": iteration,
                "summary": result.plan_summary,
                "chapters": [{"id": c.id, "focus": c.focus} for c in result.chapters_to_write],
                "improve_webapp": result.needs_webapp_improve,
                "improve_focus": getattr(result, "improvement_focus", "")
            })
            return result
    except Exception as e:
        log("WARN", f"Plan failed: {e}")

    # Fallback: pick unwritten chapters
    unwritten = [cid for cid in all_ids if cid not in existing]
    from pyharness.schemas import ChapterToWrite
    chapters = [ChapterToWrite(id=cid, focus="") for cid in unwritten[:runner.max_parallel]]
    log("INFO", f"Fallback chapters: {[c.id for c in chapters]}")
    from pyharness.log import log_event
    log_event("plan_result", {
        "iteration": iteration,
        "summary": "Fallback sequential plan (Claude failed or returned empty).",
        "chapters": [{"id": c.id, "focus": ""} for c in chapters],
        "improve_webapp": False,
        "improve_focus": ""
    })
    return PlanOutput(plan_summary="fallback", chapters_to_write=chapters)

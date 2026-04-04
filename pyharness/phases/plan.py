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

    prompt = f"""你是《{runner.config.book_title}》的编辑。制定下一轮写作计划。

## 当前状态
迭代: {iteration}
已写章节: {', '.join(existing) or 'none'}

## 上轮评估反馈
{last_eval_feedback or '无（第一轮）'}

## 书的章节目录
{chapters_section}

## 规则
1. 每轮选 2-3 个未写的章节并行撰写
2. 按章节顺序优先
3. 如果章节已存在但质量不够，可以选择重写

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
            return result
    except Exception as e:
        log("WARN", f"Plan failed: {e}")

    # Fallback: pick unwritten chapters
    unwritten = [cid for cid in all_ids if cid not in existing]
    from pyharness.schemas import ChapterToWrite
    chapters = [ChapterToWrite(id=cid, focus="") for cid in unwritten[:runner.max_parallel]]
    log("INFO", f"Fallback chapters: {[c.id for c in chapters]}")
    return PlanOutput(plan_summary="fallback", chapters_to_write=chapters)

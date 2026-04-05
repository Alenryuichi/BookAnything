"""Phase 2: Write chapters — parallel chapter generation."""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING, Optional

from pyharness.log import log
from pyharness.schemas import PlanOutput

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_write_chapters(
    runner: HarnessRunner,
    iteration: int,
    plan: Optional[PlanOutput],
) -> None:
    """Write chapters from the plan, with bounded concurrency."""
    if not plan or not plan.chapters_to_write:
        log("WARN", "No chapters to write")
        return

    sem = asyncio.Semaphore(runner.max_parallel)

    async def write_one(chapter_id: str, focus: str) -> bool:
        async with sem:
            return await _write_single_chapter(runner, iteration, chapter_id, focus)

    tasks = [
        write_one(ch.id, ch.focus) for ch in plan.chapters_to_write
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    succeeded = sum(1 for r in results if r is True)
    total = len(results)
    log("OK", f"Chapter writing: {succeeded}/{total} succeeded")


async def _write_single_chapter(
    runner: HarnessRunner,
    iteration: int,
    chapter_id: str,
    focus: str,
) -> bool:
    """Write a single chapter using Claude."""
    from pyharness.claude_client import ClaudeClient

    ch_config = runner.config.get_chapter(chapter_id)
    if not ch_config:
        log("WARN", f"Chapter {chapter_id} not found in config")
        return False

    log("INFO", f"  Writing: {chapter_id} ({ch_config.title})")

    client = ClaudeClient(cwd=runner.harness_dir)

    prompt = f"""你是一位顶级技术科普作家。请为《{runner.config.book_title}》撰写一个章节。

## 项目信息
- 项目: {runner.config.name}
- 语言: {runner.config.language}
- 简介: {runner.config.description}

## 章节信息
- ID: {chapter_id}
- 标题: {ch_config.title}
- 副标题: {ch_config.subtitle}
- 源码路径: {ch_config.sources}
- 项目根目录: {runner.config.repo_path}

## 大纲
{ch_config.outline}

## 写作要求
1. 70% 文字叙述 + 30% 代码/图表
2. 每章 3000-5000 字
3. opening_hook 200-400 字，用具体场景开头
4. 正文分 4-6 个小节，每节 500-1000 字
5. 至少 2 个比喻，至少 1 个 Mermaid 图
6. 章末 3-5 个要点总结 + 1-2 个延伸思考

## 输出：纯 JSON 对象
不要写任何其他文字，直接输出 JSON。"""

    try:
        result = await client.run(
            prompt=prompt,
            allowed_tools=["Read", "Glob", "Grep"],
            max_turns=50,
        )

        if result:
            out_path = runner.chapters_dir / f"{chapter_id}.json"
            # Try to parse as JSON, clean if needed
            text = result if isinstance(result, str) else str(result)
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                if text.endswith("```"):
                    text = text[:-3].strip()

            parsed = json.loads(text)
            out_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2))
            log("OK", f"  {chapter_id}: {out_path.stat().st_size} bytes")
            return True

    except Exception as e:
        log("ERROR", f"  {chapter_id} failed: {e}")

    return False

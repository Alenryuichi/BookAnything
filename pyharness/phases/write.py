"""Phase 2: Write chapters — parallel chapter generation."""

from __future__ import annotations

import asyncio
import json
import re
from typing import TYPE_CHECKING, Any, Optional

from pyharness.log import log
from pyharness.schemas import PlanOutput, ChapterJSON

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


async def step_write_chapters(
    runner: HarnessRunner,
    iteration: int,
    plan: Optional[PlanOutput],
    single_chapter_id: Optional[str] = None,
    skip_chapters: set[str] | None = None,
    rewrite_queue: list[str] | None = None,
) -> None:
    """Write chapters from the plan, with bounded concurrency."""
    if single_chapter_id:
        log("INFO", f"Writing single chapter: {single_chapter_id}")
        # Run directly without gathering tasks
        await _write_single_chapter(runner, iteration, single_chapter_id, "Single chapter rewrite")
        return

    if not plan or not plan.chapters_to_write:
        if not rewrite_queue:
            log("WARN", "No chapters to write")
            return

    chapters_to_write: list[tuple[str, str]] = []

    if rewrite_queue:
        for ch_id in rewrite_queue:
            if ch_id:
                chapters_to_write.append((ch_id, "User-requested rewrite"))
                log("INFO", f"Prepending rewrite chapter: {ch_id}")

    if plan and plan.chapters_to_write:
        for ch in plan.chapters_to_write:
            if skip_chapters and ch.id in skip_chapters:
                log("INFO", f"Skipping chapter: {ch.id}")
                continue
            chapters_to_write.append((ch.id, ch.focus))

    if not chapters_to_write:
        log("WARN", "No chapters to write after filtering")
        return

    sem = asyncio.Semaphore(runner.max_parallel)

    async def write_one(chapter_id: str, focus: str) -> bool:
        async with sem:
            return await _write_single_chapter(runner, iteration, chapter_id, focus)

    tasks = [
        write_one(ch_id, focus) for ch_id, focus in chapters_to_write
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    succeeded = sum(1 for r in results if r is True)
    total = len(results)
    log("OK", f"Chapter writing: {succeeded}/{total} succeeded")


def _extract_chapter_json(text: str) -> str:
    """Strip markdown fences and find the JSON object in Claude's response."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        if t.endswith("```"):
            t = t[:-3].strip()
    return t


def _try_repair_json(raw: str) -> str | None:
    """Attempt common repairs on broken JSON from LLM output.

    Known failure modes:
    - Missing opening quotes in string values:  ["Tool", 将输出..."]
    - Trailing commas before ] or }
    """
    fixed = raw
    # Fix missing opening quotes: , 中文..." or [中文..."
    fixed = re.sub(
        r'(?<=[\[,])\s*([^\s"\[\]{},][^"]*?")',
        r' "\1',
        fixed,
    )
    # Remove trailing commas
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)

    try:
        json.loads(fixed)
        return fixed
    except json.JSONDecodeError:
        return None


def validate_chapter(data: dict, chapter_id: str) -> dict:
    """Validate and normalize a chapter dict against ChapterJSON schema.

    Coerces common LLM mistakes (string arrays where objects expected)
    and ensures required fields are present.
    """
    if "chapter_id" not in data:
        data["chapter_id"] = chapter_id

    for field in ("mermaid_diagrams", "code_snippets"):
        items = data.get(field)
        if isinstance(items, list):
            data[field] = [
                {"title": item, "chart": "", "description": ""} if isinstance(item, str)
                else item
                for item in items
            ]

    ChapterJSON(**data)
    return data


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

        if not result:
            log("ERROR", f"  {chapter_id}: empty response")
            return False

        text = _extract_chapter_json(
            result if isinstance(result, str) else str(result),
        )

        # Parse JSON — attempt auto-repair on failure
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            repaired = _try_repair_json(text)
            if repaired:
                log("WARN", f"  {chapter_id}: auto-repaired broken JSON")
                parsed = json.loads(repaired)
            else:
                raise

        # Validate against schema and coerce common LLM mistakes
        parsed = validate_chapter(parsed, chapter_id)

        out_path = runner.chapters_dir / f"{chapter_id}.json"
        out_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2))
        log("OK", f"  {chapter_id}: {out_path.stat().st_size} bytes")
        return True

    except Exception as e:
        log("ERROR", f"  {chapter_id} failed: {e}")

    return False

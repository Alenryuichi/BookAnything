"""Phase 2: Write chapters — parallel chapter generation."""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import TYPE_CHECKING, Any, Optional

from pyharness.log import log, log_event
from pyharness.schemas import PlanOutput, ChapterJSON

def _load_kg_context_for_chapter(runner: "HarnessRunner", chapter_id: str) -> str:
    """Load knowledge graph context relevant to this chapter from chapter-outline.json."""
    try:
        outline_path = runner.knowledge_dir / "chapter-outline.json"
        if not outline_path.exists():
            return ""
        import json as _json
        outline = _json.loads(outline_path.read_text())
        for part in outline.get("parts", []):
            for ch in part.get("chapters", []):
                if ch.get("id") == chapter_id:
                    coverage = ch.get("kg_coverage", [])
                    if not coverage:
                        return ""
                    kg_path = runner.knowledge_dir / "knowledge-graph.json"
                    if not kg_path.exists():
                        return f"\n## 该章覆盖的知识图谱概念\n{', '.join(coverage)}"
                    kg = _json.loads(kg_path.read_text())
                    node_map = {n["id"]: n for n in kg.get("nodes", [])}
                    lines = []
                    for nid in coverage:
                        node = node_map.get(nid)
                        if node:
                            lines.append(f"- [{node.get('type','?')}] {node.get('name','?')}: {node.get('summary','')[:120]}")
                        else:
                            lines.append(f"- {nid}")
                    edge_lines = []
                    cov_set = set(coverage)
                    for edge in kg.get("edges", []):
                        if edge.get("source") in cov_set or edge.get("target") in cov_set:
                            edge_lines.append(f"  {edge['source']} --{edge.get('type','?')}--> {edge['target']}")
                    ctx = "\n## 该章覆盖的知识图谱概念\n" + "\n".join(lines)
                    if edge_lines:
                        ctx += "\n\n## 相关依赖关系\n" + "\n".join(edge_lines[:20])
                    return ctx
    except Exception:
        pass
    return ""

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

    for ch in plan.chapters_to_write:
        log_event("chapter_status", {"chapter_id": ch.id, "status": "waiting"})

    sem = asyncio.Semaphore(runner.max_parallel)

    async def write_one(chapter_id: str, focus: str) -> bool:
        async with sem:
            log_event("chapter_status", {"chapter_id": chapter_id, "status": "writing"})
            t0 = time.time()
            ok = await _write_single_chapter(runner, iteration, chapter_id, focus)
            elapsed_ms = int((time.time() - t0) * 1000)
            if ok:
                ch_path = runner.chapters_dir / f"{chapter_id}.json"
                wc = 0
                try:
                    import json as _json
                    data = _json.loads(ch_path.read_text())
                    wc = data.get("word_count", 0)
                except Exception:
                    pass
                log_event("chapter_status", {"chapter_id": chapter_id, "status": "done", "word_count": wc, "elapsed_ms": elapsed_ms})
            else:
                log_event("chapter_status", {"chapter_id": chapter_id, "status": "failed", "error": f"Chapter {chapter_id} write failed", "elapsed_ms": elapsed_ms})
            return ok

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
    
    # Try to find markdown json block anywhere
    import re
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", t, re.DOTALL)
    if match:
        return match.group(1).strip()
        
    # Fallback to finding the first { and last }
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return t[start:end+1].strip()
        
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
    """Write a single chapter using Claude, with retry and error context."""
    from pyharness.claude_client import ClaudeClient
    from pyharness.errors import ErrorClass, classify_error, build_error_context, RETRYABLE

    ch_config = runner.config.get_chapter(chapter_id)
    if not ch_config:
        log("WARN", f"Chapter {chapter_id} not found in config")
        return False

    log("INFO", f"  Writing: {chapter_id} ({ch_config.title})")

    client = ClaudeClient(cwd=runner.harness_dir, max_retries=0)

    MAX_ATTEMPTS = 3
    last_error_context = ""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        raw_output = ""
        try:
            kg_context = _load_kg_context_for_chapter(runner, chapter_id)
            base_prompt = f"""你是一位顶级技术科普作家。请为《{runner.config.book_title}》撰写一个章节。

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
{kg_context}
## 写作要求
1. 70% 文字叙述 + 30% 代码/图表
2. 每章 3000-5000 字
3. opening_hook 200-400 字，用具体场景开头
4. 正文分 4-6 个小节，每节 500-1000 字
5. 至少 2 个比喻，至少 1 个 Mermaid 图
6. 章末 3-5 个要点总结 + 1-2 个延伸思考

## 输出：纯 JSON 对象
不要写任何其他文字，直接输出 JSON。"""

            prompt = base_prompt
            if last_error_context:
                prompt = base_prompt + "\n\n" + last_error_context

            if attempt > 1:
                log("INFO", f"  {chapter_id}: retry attempt {attempt}/{MAX_ATTEMPTS}")

            result = await client.run(
                prompt=prompt,
                allowed_tools=["Read", "Glob", "Grep"],
                max_turns=50,
            )

            if not result:
                raise RuntimeError("Claude CLI returned empty response")

            raw_output = result if isinstance(result, str) else str(result)
            text = _extract_chapter_json(raw_output)

            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                repaired = _try_repair_json(text)
                if repaired:
                    log("WARN", f"  {chapter_id}: auto-repaired broken JSON")
                    parsed = json.loads(repaired)
                else:
                    raise

            parsed = validate_chapter(parsed, chapter_id)

            out_path = runner.chapters_dir / f"{chapter_id}.json"
            out_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2))
            log("OK", f"  {chapter_id}: {out_path.stat().st_size} bytes")

            if runner.error_ledger:
                runner.error_ledger.clear_for_chapter(chapter_id)

            return True

        except Exception as e:
            error_class = classify_error(e, raw_output)
            log("ERROR", f"  {chapter_id} attempt {attempt}/{MAX_ATTEMPTS} failed [{error_class.value}]: {e}")

            if runner.error_ledger:
                runner.error_ledger.record(
                    iteration=iteration,
                    phase="write",
                    chapter_id=chapter_id,
                    error_class=error_class,
                    attempt=attempt,
                    max_attempts=MAX_ATTEMPTS,
                    error_message=str(e),
                    raw_output_preview=raw_output[:300],
                )

            log_event("chapter_error", {
                "chapter_id": chapter_id,
                "error_class": error_class.value,
                "attempt": attempt,
                "max_attempts": MAX_ATTEMPTS,
                "message": str(e)[:200],
            })

            if error_class not in RETRYABLE:
                log("ERROR", f"  {chapter_id}: non-retryable error ({error_class.value}), giving up")
                break

            if attempt < MAX_ATTEMPTS:
                last_error_context = build_error_context(error_class, str(e), raw_output[:500])
            else:
                log("ERROR", f"  {chapter_id}: all {MAX_ATTEMPTS} attempts exhausted")

    return False

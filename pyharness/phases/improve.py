"""Phase 3: Improve webapp with component-level diagnostic signals."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from pyharness.log import log

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner


def _build_diagnostic_blocks(runner: HarnessRunner) -> str:
    """Build structured diagnostic JSON for each broken component."""
    report_path = runner.harness_dir / "output" / "screenshots" / "report.json"
    if not report_path.exists():
        return _fallback_diagnostics()

    try:
        report = json.loads(report_path.read_text())
    except Exception:
        return _fallback_diagnostics()

    from pyharness.eval import _aggregate_chapter_diagnostics, _get_search_diagnostics
    agg = _aggregate_chapter_diagnostics(report)
    m = agg["mermaid"]
    c = agg["code"]
    s = _get_search_diagnostics(report)

    blocks: list[dict[str, Any]] = []

    # Mermaid (8 points)
    if m["svgs_total"] == 0:
        diag = "mermaid.js 未加载" if not m["js_loaded"] else (
            f"JS 已加载但 {m['containers_total']} 个容器中 0 个渲染为 SVG"
            if m["containers_total"] > 0
            else "JS 已加载但页面无 .mermaid 容器"
        )
        blocks.append({
            "component": "MermaidDiagram",
            "file": "web-app/components/MermaidDiagram.tsx",
            "score_impact": "8 points (mermaid rendering)",
            "status": "broken",
            "diagnosis": diag,
            "console_errors": m["console_errors"][:3],
            "render_errors": m["render_errors"][:3],
            "fix_hint": (
                "确保: 1) mermaid 库通过 dynamic import 在客户端加载, "
                "2) mermaid.initialize({startOnLoad: false}) 调用, "
                "3) chart 数据放入 <div class='mermaid'> 容器, "
                "4) mermaid.run() 在容器挂载后调用"
            ),
        })

    # Code blocks (5 points)
    if c["pre_total"] == 0 and c["code_tag_total"] == 0:
        blocks.append({
            "component": "CodeBlock",
            "file": "web-app/components/CodeBlock.tsx",
            "score_impact": "5 points (code highlighting)",
            "status": "broken",
            "diagnosis": "章节页面完全没有 <pre> 或 <code> 标签",
            "fix_hint": (
                "检查: 1) CodeBlock 组件是否被 chapters/[id]/page.tsx 正确引用, "
                "2) 章节 JSON sections[].code 数据是否传给 CodeBlock, "
                "3) shiki 的 codeToHtml() 是否正确调用并输出 <pre> 标签"
            ),
        })
    elif c["pre_total"] > 0 and not c["shiki_found"]:
        blocks.append({
            "component": "CodeBlock",
            "file": "web-app/components/CodeBlock.tsx",
            "score_impact": "5 points (code highlighting)",
            "status": "partial",
            "diagnosis": f"{c['pre_total']} 个 <pre> 标签存在但无 shiki 高亮类",
            "fix_hint": (
                "检查: 1) shiki highlighter 是否正确初始化 (getHighlighter/createHighlighter), "
                "2) codeToHtml() 输出是否包含 language-* 或 shiki class, "
                "3) 是否有 SSR/CSR 不匹配导致高亮丢失"
            ),
        })

    # Search (4 points)
    if s["input_found"] and s["results_after_query"] == 0:
        blocks.append({
            "component": "SearchClient",
            "file": "web-app/components/SearchClient.tsx",
            "score_impact": "4 points (search results)",
            "status": "broken",
            "diagnosis": f"搜索输入可用但输入查询后 0 结果 (resultsAfterQuery={s['results_after_query']})",
            "related_file": "web-app/lib/search-index.ts",
            "fix_hint": (
                "检查: 1) buildSearchEntries() 是否正确从 chapters 数据构建索引, "
                "2) SearchClient 的 filter 逻辑是否正确匹配查询, "
                "3) entries prop 是否从 server component 正确传递到 client component"
            ),
        })
    elif not s["input_found"]:
        blocks.append({
            "component": "SearchClient",
            "file": "web-app/components/SearchClient.tsx",
            "score_impact": "4 points (search results)",
            "status": "broken",
            "diagnosis": "搜索页面未找到 input 元素",
            "fix_hint": "检查 SearchClient 组件是否正确渲染 <input> 元素",
        })

    if not blocks:
        return ""

    return json.dumps(blocks, ensure_ascii=False, indent=2)


def _fallback_diagnostics() -> str:
    """Default diagnostics when no report.json exists."""
    return json.dumps([
        {
            "component": "MermaidDiagram",
            "file": "web-app/components/MermaidDiagram.tsx",
            "score_impact": "8 points",
            "status": "unknown",
            "fix_hint": "检查 mermaid 动态加载和渲染逻辑",
        },
        {
            "component": "CodeBlock",
            "file": "web-app/components/CodeBlock.tsx",
            "score_impact": "5 points",
            "status": "unknown",
            "fix_hint": "检查 shiki 代码高亮是否正确初始化",
        },
        {
            "component": "SearchClient",
            "file": "web-app/components/SearchClient.tsx",
            "score_impact": "4 points",
            "status": "unknown",
            "fix_hint": "检查搜索数据加载和过滤逻辑",
        },
    ], ensure_ascii=False, indent=2)


async def step_improve_webapp(
    runner: HarnessRunner,
    iteration: int,
    last_eval_feedback: str,
) -> None:
    """Fix webapp issues using component-level diagnostics."""
    from pyharness.claude_client import ClaudeClient

    client = ClaudeClient(cwd=runner.harness_dir)
    diagnostic_blocks = _build_diagnostic_blocks(runner)

    prompt = f"""你是 Web 前端修复专家。根据以下精确的组件级诊断信息修复 Web App 的问题。

## 约束
- 只能修改 {runner.webapp_dir}/ 下的文件
- 不要修改 knowledge/ 目录下的 JSON 数据文件
- 不要创建新的顶级目录
- 每个组件修复后确保不破坏现有功能

## 组件级诊断（按分值影响排序）

{diagnostic_blocks or '无诊断数据，请检查以下三个关键组件：MermaidDiagram.tsx, CodeBlock.tsx, SearchClient.tsx'}

## 评估反馈摘要
{last_eval_feedback or '无'}

## 修复步骤
1. 先用 Read 工具读取诊断中列出的每个 file 路径
2. 根据 diagnosis 和 fix_hint 定位具体问题
3. 用 Edit 工具修复，每次只改一个组件
4. 如有 related_file，也要检查

## 输出纯 JSON
{{"changes_made": [], "files_modified": [], "issues_fixed": [], "issues_remaining": []}}"""

    result = await client.run(
        prompt=prompt,
        allowed_tools=["Read", "Glob", "Grep", "Write", "Edit"],
        max_turns=40,
    )
    log("OK", "Webapp improve completed")

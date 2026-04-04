"""Deterministic evaluation with component-level diagnostics."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pyharness.schemas import (
    DimensionDetail,
    DimensionEval,
    MergedEval,
    ScoresBreakdown,
)


def _load_report(report_path: Path) -> dict[str, Any]:
    if not report_path.exists():
        return {}
    try:
        return json.loads(report_path.read_text())
    except Exception:
        return {}


def _aggregate_chapter_diagnostics(report: dict) -> dict[str, Any]:
    """Aggregate diagnostics across all chapter-* pages."""
    mermaid_js_loaded = False
    mermaid_containers_total = 0
    mermaid_svgs_total = 0
    mermaid_render_errors: list[str] = []
    mermaid_console_errors: list[str] = []

    code_pre_total = 0
    code_tag_total = 0
    code_shiki_found = False
    code_highlighted_total = 0

    chapter_count = 0

    for name, page_data in report.get("pages", {}).items():
        if not name.startswith("chapter-"):
            continue
        chapter_count += 1
        diag = page_data.get("diagnostics", {})

        m = diag.get("mermaid", {})
        if m.get("jsLoaded"):
            mermaid_js_loaded = True
        mermaid_containers_total += int(m.get("containersFound", 0))
        mermaid_svgs_total += int(m.get("svgsRendered", 0))
        mermaid_render_errors.extend(m.get("renderErrors", []))
        mermaid_console_errors.extend(m.get("consoleErrors", []))

        cb = diag.get("codeBlock", {})
        code_pre_total += int(cb.get("preTagCount", 0))
        code_tag_total += int(cb.get("codeTagCount", 0))
        if cb.get("shikiClassesFound"):
            code_shiki_found = True
        code_highlighted_total += int(cb.get("highlightedBlockCount", 0))

    return {
        "chapter_count": chapter_count,
        "mermaid": {
            "js_loaded": mermaid_js_loaded,
            "containers_total": mermaid_containers_total,
            "svgs_total": mermaid_svgs_total,
            "render_errors": mermaid_render_errors[:5],
            "console_errors": mermaid_console_errors[:5],
        },
        "code": {
            "pre_total": code_pre_total,
            "code_tag_total": code_tag_total,
            "shiki_found": code_shiki_found,
            "highlighted_total": code_highlighted_total,
        },
    }


def _get_search_diagnostics(report: dict) -> dict[str, Any]:
    """Extract search page diagnostics."""
    search_page = report.get("pages", {}).get("search", {})
    diag = search_page.get("diagnostics", {}).get("search", {})
    return {
        "input_found": diag.get("inputFound", False),
        "query_typed": diag.get("queryTyped", False),
        "results_after_query": int(diag.get("resultsAfterQuery", 0)),
        "card_count_after_query": int(diag.get("cardCountAfterQuery", 0)),
    }


def eval_content(chapters_dir: Path, total_chapters: int) -> DimensionEval:
    """Content quality score (max 40)."""
    chapter_files = sorted(chapters_dir.glob("*.json")) if chapters_dir.exists() else []
    analysis_count = len(chapter_files)
    total = max(total_chapters, 1)
    safe_count = max(analysis_count, 1)

    coverage = analysis_count * 15 // total

    vol_count = 0
    depth_a_count = 0
    depth_b_count = 0

    for f in chapter_files:
        try:
            fsize = f.stat().st_size
            data = json.loads(f.read_text())
            sections = len(data.get("sections", []))
            wcount = int(data.get("word_count", 0))
        except Exception:
            continue

        if fsize > 10240 and sections >= 4:
            vol_count += 1
        if wcount >= 3000 and sections >= 4:
            depth_a_count += 1
        if sections >= 5:
            depth_b_count += 1

    volume = vol_count * 15 // safe_count
    depth_a = depth_a_count * 5 // safe_count
    depth_b = depth_b_count * 5 // safe_count
    depth = depth_a + depth_b
    score = coverage + volume + depth

    issues: list[str] = []
    suggestions: list[str] = []
    if coverage < 15:
        issues.append(f"覆盖率不足: {analysis_count}/{total_chapters} 章节已写")
        suggestions.append("继续撰写未完成的章节")
    if volume < 10:
        issues.append(f"内容量不足: {vol_count}/{analysis_count} 章节达到 10KB+4sections 标准")
        suggestions.append("增加章节内容深度和小节数量")
    if depth < 6:
        issues.append("叙事深度不足: word_count>=3000的章节比例偏低")
        suggestions.append("扩充章节字数到3000-5000范围")

    return DimensionEval(
        dimension="content",
        score=score,
        max_score=40,
        breakdown={"coverage": coverage, "volume": volume, "depth": depth},
        issues=issues,
        suggestions=suggestions,
    )


def eval_visual(webapp_dir: Path, report_path: Path) -> DimensionEval:
    """Visual quality score (max 35) with component-level diagnostics."""
    build_score = 10 if (webapp_dir / "out").is_dir() else 0

    report = _load_report(report_path)
    summary = report.get("summary", {})
    total_errors = int(summary.get("totalErrors", 0))
    mermaid_rendered = int(summary.get("totalMermaidRendered", 0))
    mermaid_errors_count = int(summary.get("totalMermaidErrors", 0))

    home = report.get("pages", {}).get("home", {}).get("metrics", {})
    has_sidebar = home.get("hasSidebar", False) is True
    has_dark_mode = home.get("hasDarkModeToggle", False) is True
    home_card_count = int(home.get("cardCount", 0))
    home_body_text = int(home.get("bodyText", 0))

    agg = _aggregate_chapter_diagnostics(report)
    m_diag = agg["mermaid"]

    no_errors_score = max(0, 10 - total_errors * 2)

    if mermaid_rendered > 0 and mermaid_errors_count == 0:
        mermaid_score = 8
    elif mermaid_rendered > 0:
        mermaid_score = 4
    else:
        mermaid_score = 0

    layout_score = 0
    if has_sidebar:
        layout_score += 2
    if has_dark_mode:
        layout_score += 1
    if home_card_count > 5:
        layout_score += 2
    if home_body_text > 200:
        layout_score += 2

    score = build_score + no_errors_score + mermaid_score + layout_score

    issues: list[str] = []
    suggestions: list[str] = []

    if build_score == 0:
        issues.append("网站未构建成功")
        suggestions.append("检查 output/logs/next-build.err 中的构建错误")

    if total_errors > 0:
        cats = report.get("pages", {}).get("home", {}).get("categorizedErrors", {})
        mermaid_errs = cats.get("mermaid", [])
        other_errs = cats.get("other", [])
        if mermaid_errs:
            issues.append(f"[web-app/components/MermaidDiagram.tsx] {len(mermaid_errs)} 个 mermaid console errors: {mermaid_errs[0][:100]}")
        if other_errs:
            issues.append(f"Console errors: {len(other_errs)} 个非组件错误")
        suggestions.append("修复 JavaScript 运行时错误，优先处理 mermaid 相关错误")

    if mermaid_score < 8:
        if not m_diag["js_loaded"]:
            issues.append(
                f"[web-app/components/MermaidDiagram.tsx] mermaid.js 未加载 (jsLoaded=false)，"
                f"检查动态 import('mermaid') 和 mermaid.initialize() 调用"
            )
            suggestions.append(
                "[web-app/components/MermaidDiagram.tsx] 确保 mermaid 库在客户端通过 dynamic import 加载，"
                "并在组件 useEffect 中调用 mermaid.initialize() + mermaid.run()"
            )
        elif m_diag["containers_total"] == 0:
            issues.append(
                f"[web-app/components/MermaidDiagram.tsx] mermaid.js 已加载但页面无 .mermaid 容器，"
                f"检查组件是否将 chart 数据渲染为 <div class='mermaid'> 元素"
            )
            suggestions.append(
                "[web-app/components/MermaidDiagram.tsx] 确保 chart prop 被放入 "
                "<div className='mermaid'>{chart}</div> 或类似容器"
            )
        elif m_diag["svgs_total"] == 0:
            errors_hint = ""
            if m_diag["render_errors"]:
                errors_hint = f"，渲染错误: {m_diag['render_errors'][0][:80]}"
            issues.append(
                f"[web-app/components/MermaidDiagram.tsx] 找到 {m_diag['containers_total']} 个容器"
                f"但 0 个 SVG 渲染成功{errors_hint}"
            )
            suggestions.append(
                "[web-app/components/MermaidDiagram.tsx] mermaid 容器存在但未渲染为 SVG，"
                "检查 mermaid.run() 是否在容器挂载后调用，以及 chart 语法是否合法"
            )
        else:
            issues.append(
                f"Mermaid 部分渲染: {m_diag['svgs_total']}/{m_diag['containers_total']} 容器成功"
            )
            suggestions.append("检查失败的 mermaid 图表语法")

    if layout_score < 5:
        issues.append("布局指标不完整")
        suggestions.append("检查 sidebar、dark mode toggle、首页卡片数量")

    return DimensionEval(
        dimension="visual",
        score=score,
        max_score=35,
        breakdown={"build": build_score, "no_errors": no_errors_score, "mermaid": mermaid_score, "layout": layout_score},
        issues=issues,
        suggestions=suggestions,
    )


def eval_interaction(report_path: Path) -> DimensionEval:
    """Interaction score (max 25) with component-level diagnostics."""
    report = _load_report(report_path)
    summary = report.get("summary", {})
    pages_with_errors = int(summary.get("pagesWithErrors", 0))

    search_metrics = report.get("pages", {}).get("search", {}).get("metrics", {})
    search_has_input = search_metrics.get("hasSearchInput", False) is True
    search_card_count = int(search_metrics.get("cardCount", 0))

    home = report.get("pages", {}).get("home", {}).get("metrics", {})
    has_sidebar = home.get("hasSidebar", False) is True
    nav_item_count = int(home.get("navItemCount", 0))
    home_link_count = int(home.get("linkCount", 0))

    max_code_blocks = 0
    for page_data in report.get("pages", {}).values():
        metrics = page_data.get("metrics") or {}
        cb = int(metrics.get("codeBlockCount", 0))
        if cb > max_code_blocks:
            max_code_blocks = cb

    agg = _aggregate_chapter_diagnostics(report)
    c_diag = agg["code"]
    s_diag = _get_search_diagnostics(report)

    search_score = (4 if search_has_input else 0) + (4 if search_card_count > 0 else 0)

    nav_score = 0
    if has_sidebar:
        nav_score += 3
    if nav_item_count > 10:
        nav_score += 2
    if home_link_count > 10:
        nav_score += 2

    code_score = 5 if max_code_blocks > 0 else 0
    routing_score = max(0, 5 - pages_with_errors)

    score = search_score + nav_score + code_score + routing_score

    issues: list[str] = []
    suggestions: list[str] = []

    if search_score < 8:
        if not search_has_input:
            issues.append("[web-app/components/SearchClient.tsx] 搜索输入框未找到 (hasSearchInput=false)")
            suggestions.append("[web-app/components/SearchClient.tsx] 检查 input 元素是否正确渲染")
        elif s_diag["query_typed"] and s_diag["results_after_query"] == 0:
            issues.append(
                f"[web-app/components/SearchClient.tsx] 搜索输入可用但输入查询后 0 结果 "
                f"(resultsAfterQuery=0)，过滤逻辑可能有问题"
            )
            suggestions.append(
                "[web-app/components/SearchClient.tsx] 检查搜索过滤逻辑: entries 数据是否正确传入，"
                "filter 条件是否匹配章节内容; 也检查 [web-app/lib/search-index.ts] 的 buildSearchEntries()"
            )
        elif search_card_count == 0:
            issues.append(
                f"[web-app/components/SearchClient.tsx] 搜索有 input 但 cardCount=0"
            )
            suggestions.append(
                "[web-app/components/SearchClient.tsx] 检查结果列表的 CSS class 是否包含 .card"
            )

    if nav_score < 5:
        issues.append(f"导航: sidebar={has_sidebar}, navItems={nav_item_count}, links={home_link_count}")
        suggestions.append("确保 sidebar 和导航链接完整")

    if code_score == 0:
        if c_diag["pre_total"] > 0 and not c_diag["shiki_found"]:
            issues.append(
                f"[web-app/components/CodeBlock.tsx] 找到 {c_diag['pre_total']} 个 <pre> 标签"
                f"但无 shiki 高亮类 (shikiClassesFound=false)"
            )
            suggestions.append(
                "[web-app/components/CodeBlock.tsx] <pre> 标签存在但 shiki 未渲染高亮，"
                "检查 shiki highlighter 是否正确初始化，"
                "确保 codeToHtml() 或 getHighlighter() 在服务端/客户端正确调用"
            )
        elif c_diag["pre_total"] == 0 and c_diag["code_tag_total"] > 0:
            issues.append(
                f"[web-app/components/CodeBlock.tsx] 有 {c_diag['code_tag_total']} 个 <code> 标签"
                f"但 0 个 <pre> 标签，代码块可能没被正确包裹"
            )
            suggestions.append(
                "[web-app/components/CodeBlock.tsx] 确保代码块输出为 <pre><code>...</code></pre> 结构"
            )
        elif c_diag["pre_total"] == 0 and c_diag["code_tag_total"] == 0:
            issues.append(
                "[web-app/components/CodeBlock.tsx] 章节页面完全没有 <pre> 或 <code> 标签"
            )
            suggestions.append(
                "[web-app/components/CodeBlock.tsx] 检查组件是否被章节页面正确引用，"
                "以及章节 JSON 的 sections[].code 数据是否正确传递给 CodeBlock 组件; "
                "也检查 [web-app/app/chapters/[id]/page.tsx] 中 CodeBlock 的渲染条件"
            )

    if routing_score < 5:
        issues.append(f"页面错误: {pages_with_errors} 个页面有 navigation errors")
        suggestions.append("修复页面加载错误，检查 Next.js 路由和数据加载")

    return DimensionEval(
        dimension="interaction",
        score=score,
        max_score=25,
        breakdown={"search": search_score, "navigation": nav_score, "code_highlight": code_score, "page_routing": routing_score},
        issues=issues,
        suggestions=suggestions,
    )


def merge_scores(
    content: DimensionEval,
    visual: DimensionEval,
    interaction: DimensionEval,
) -> MergedEval:
    """Combine three dimension scores into final evaluation."""
    return MergedEval(
        score=content.score + visual.score + interaction.score,
        scores=ScoresBreakdown(
            content=content.score,
            visual=visual.score,
            interaction=interaction.score,
        ),
        content=DimensionDetail(score=content.score, issues=content.issues, suggestions=content.suggestions),
        visual=DimensionDetail(score=visual.score, issues=visual.issues, suggestions=visual.suggestions),
        interaction=DimensionDetail(score=interaction.score, issues=interaction.issues, suggestions=interaction.suggestions),
    )

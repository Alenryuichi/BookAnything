"""Deterministic evaluation — identical arithmetic to run.sh bash formulas."""

from __future__ import annotations

import json
from pathlib import Path

from pyharness.schemas import (
    DimensionDetail,
    DimensionEval,
    MergedEval,
    ScoresBreakdown,
)


def eval_content(chapters_dir: Path, total_chapters: int) -> DimensionEval:
    """Content quality score (max 40). Mirrors bash eval_content()."""
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
    """Visual quality score (max 35). Mirrors bash eval_visual()."""
    build_score = 10 if (webapp_dir / "out").is_dir() else 0

    total_errors = 0
    mermaid_rendered = 0
    mermaid_errors = 0
    has_sidebar = False
    has_dark_mode = False
    home_card_count = 0
    home_body_text = 0

    if report_path.exists():
        try:
            report = json.loads(report_path.read_text())
            summary = report.get("summary", {})
            total_errors = int(summary.get("totalErrors", 0))
            mermaid_rendered = int(summary.get("totalMermaidRendered", 0))
            mermaid_errors = int(summary.get("totalMermaidErrors", 0))

            home = report.get("pages", {}).get("home", {}).get("metrics", {})
            has_sidebar = home.get("hasSidebar", False) is True
            has_dark_mode = home.get("hasDarkModeToggle", False) is True
            home_card_count = int(home.get("cardCount", 0))
            home_body_text = int(home.get("bodyText", 0))
        except Exception:
            pass

    no_errors_score = max(0, 10 - total_errors * 2)

    if mermaid_rendered > 0 and mermaid_errors == 0:
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
        suggestions.append("检查 next build 错误日志")
    if total_errors > 0:
        issues.append(f"Console errors: {total_errors} 个")
        suggestions.append("修复 JavaScript 运行时错误")
    if mermaid_score < 8:
        issues.append(f"Mermaid: {mermaid_rendered} rendered, {mermaid_errors} errors")
        suggestions.append("检查 Mermaid 图表语法和渲染组件")
    if layout_score < 5:
        issues.append("布局指标不完整")
        suggestions.append("检查 sidebar、dark mode、卡片数量")

    return DimensionEval(
        dimension="visual",
        score=score,
        max_score=35,
        breakdown={"build": build_score, "no_errors": no_errors_score, "mermaid": mermaid_score, "layout": layout_score},
        issues=issues,
        suggestions=suggestions,
    )


def eval_interaction(report_path: Path) -> DimensionEval:
    """Interaction score (max 25). Mirrors bash eval_interaction()."""
    search_has_input = False
    search_card_count = 0
    has_sidebar = False
    nav_item_count = 0
    home_link_count = 0
    max_code_blocks = 0
    pages_with_errors = 0

    if report_path.exists():
        try:
            report = json.loads(report_path.read_text())
            summary = report.get("summary", {})
            pages_with_errors = int(summary.get("pagesWithErrors", 0))

            search = report.get("pages", {}).get("search", {}).get("metrics", {})
            search_has_input = search.get("hasSearchInput", False) is True
            search_card_count = int(search.get("cardCount", 0))

            home = report.get("pages", {}).get("home", {}).get("metrics", {})
            has_sidebar = home.get("hasSidebar", False) is True
            nav_item_count = int(home.get("navItemCount", 0))
            home_link_count = int(home.get("linkCount", 0))

            for page_data in report.get("pages", {}).values():
                metrics = page_data.get("metrics", {})
                cb = int(metrics.get("codeBlockCount", 0))
                if cb > max_code_blocks:
                    max_code_blocks = cb
        except Exception:
            pass

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
        issues.append(f"搜索功能: input={search_has_input}, cards={search_card_count}")
        suggestions.append("改进搜索页面的数据加载和结果展示")
    if nav_score < 5:
        issues.append(f"导航: sidebar={has_sidebar}, navItems={nav_item_count}, links={home_link_count}")
        suggestions.append("确保 sidebar 和导航链接完整")
    if code_score == 0:
        issues.append("无代码高亮: 所有页面 codeBlockCount=0")
        suggestions.append("检查 CodeBlock 组件和 shiki 渲染")
    if routing_score < 5:
        issues.append(f"页面错误: {pages_with_errors} 个页面有 errors")
        suggestions.append("修复页面加载错误")

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

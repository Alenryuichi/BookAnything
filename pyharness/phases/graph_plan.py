"""Graph-driven chapter planning: community detection + topological sort + LLM polish.

Two-phase approach:
  Phase A (deterministic): networkx community detection + topo sort → AlgorithmicPlan
  Phase B (LLM creative): Claude names Parts, writes chapter titles/outlines

References:
  - Microsoft GraphRAG: Leiden community detection for thematic clustering
  - KnowLP [arXiv:2506.22303]: dual-structure prerequisite + similarity graphs
  - DualGraph [arXiv:2602.13830]: separate KG from outline graph
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import networkx as nx

from pyharness.log import log, log_event
from pyharness.schemas import (
    AlgorithmicPlan,
    ChapterOutline,
    Community,
    GraphEdge,
    GraphNode,
    GraphSummary,
    KnowledgeGraph,
    OutlineChapter,
    OutlinePart,
)

SEMANTIC_TYPES = frozenset({"Concept", "Workflow", "DataModel", "Component", "CodeEntity"})
ORDERING_EDGE_TYPES = frozenset({"DEPENDS_ON", "IMPLEMENTS", "TRIGGERS"})


def extract_graph_summary(kg_path: Path) -> GraphSummary:
    """Read knowledge-graph.json and extract semantic summary."""
    data = json.loads(kg_path.read_text(encoding="utf-8"))
    kg = KnowledgeGraph.model_validate(data)

    semantic_nodes = [n for n in kg.nodes if n.type in SEMANTIC_TYPES]
    file_nodes = [n for n in kg.nodes if n.type == "file"]
    semantic_edges = [e for e in kg.edges if e.type in ORDERING_EDGE_TYPES]

    layer_dist: dict[str, int] = {}
    for n in kg.nodes:
        layer_dist[n.layer] = layer_dist.get(n.layer, 0) + 1

    return GraphSummary(
        semantic_nodes=semantic_nodes,
        semantic_edges=semantic_edges,
        file_nodes=file_nodes,
        layer_distribution=layer_dist,
        total_nodes=len(kg.nodes),
        total_edges=len(kg.edges),
    )


def compute_algorithmic_plan(summary: GraphSummary) -> AlgorithmicPlan:
    """Deterministic graph algorithms: community detection + topological sort."""
    if len(summary.semantic_nodes) < 2:
        node_ids = [n.id for n in summary.semantic_nodes]
        return AlgorithmicPlan(
            communities=[Community(id="c0", node_ids=node_ids, label="all")],
            topo_order=node_ids,
            centrality={nid: 1.0 for nid in node_ids},
        )

    G = nx.DiGraph()
    for n in summary.semantic_nodes:
        G.add_node(n.id, name=n.name, type=n.type, layer=n.layer, summary=n.summary)
    for e in summary.semantic_edges:
        if e.source in G and e.target in G:
            G.add_edge(e.source, e.target, type=e.type)

    # Community detection (on undirected projection)
    communities: list[Community] = []
    if len(summary.semantic_nodes) < 5:
        communities = [Community(
            id="c0",
            node_ids=list(G.nodes()),
            label="all",
        )]
    else:
        U = G.to_undirected()
        try:
            partition = nx.community.louvain_communities(U, seed=42)
            for i, comm_set in enumerate(partition):
                communities.append(Community(
                    id=f"c{i}",
                    node_ids=sorted(comm_set),
                ))
        except Exception:
            communities = [Community(id="c0", node_ids=list(G.nodes()), label="all")]

    # Topological sort (break cycles if needed)
    cycle_breaks: list[tuple[str, str]] = []
    centrality = nx.degree_centrality(G) if G.number_of_nodes() > 0 else {}

    work_graph = G.copy()
    max_attempts = G.number_of_edges()
    attempt = 0
    while not nx.is_directed_acyclic_graph(work_graph) and attempt < max_attempts:
        try:
            cycle = nx.find_cycle(work_graph)
            weakest = min(cycle, key=lambda e: centrality.get(e[1], 0))
            work_graph.remove_edge(weakest[0], weakest[1])
            cycle_breaks.append((weakest[0], weakest[1]))
            log("WARN", f"Broke cycle edge: {weakest[0]} -> {weakest[1]}")
        except nx.NetworkXNoCycle:
            break
        attempt += 1

    try:
        topo_order = list(nx.topological_sort(work_graph))
    except nx.NetworkXUnfeasible:
        topo_order = list(G.nodes())

    return AlgorithmicPlan(
        communities=communities,
        topo_order=topo_order,
        centrality=centrality,
        cycle_breaks=cycle_breaks,
    )


def build_graph_planning_prompt(
    plan: AlgorithmicPlan,
    summary: GraphSummary,
    scan: Any,
) -> str:
    """Build the LLM prompt with pre-computed algorithmic constraints."""
    parts_text = []
    node_map = {n.id: n for n in summary.semantic_nodes}

    for comm in plan.communities:
        comm_nodes = [node_map[nid] for nid in comm.node_ids if nid in node_map]
        ordered = [nid for nid in plan.topo_order if nid in set(comm.node_ids)]
        if not ordered:
            ordered = comm.node_ids

        nodes_desc = []
        for nid in ordered:
            n = node_map.get(nid)
            if n:
                cent = plan.centrality.get(nid, 0)
                nodes_desc.append(f"  - [{n.type}] {n.name} (id={n.id}, layer={n.layer}, centrality={cent:.2f}): {n.summary}")

        parts_text.append(f"""### Part candidate: {comm.id}
Nodes (in prerequisite order):
{chr(10).join(nodes_desc)}""")

    deps_text = []
    for e in summary.semantic_edges[:100]:
        deps_text.append(f"  {e.source} --{e.type}--> {e.target}")

    return f"""\
你是一位技术书籍的资深策划编辑。请基于以下语义知识图谱为开源项目规划章节。

## 项目信息
- 项目名: {scan.project_name}
- 语言: {scan.language}
- 文件数: {scan.file_count}, 代码行数: ~{scan.line_count}

## 算法预计算结果

以下 Part 分组和节点排序由社区检测 + 拓扑排序算法生成，**请保持分组和前置依赖顺序**，你的任务是：
1. 为每个 Part 起一个有吸引力的标题
2. 将每个 Part 中的节点组织为章节（可以合并相关节点为一章，或拆分复杂节点为多章）
3. 为每章写标题、副标题和 5-7 条大纲要点
4. 确保 prerequisites 字段反映节点间的 DEPENDS_ON 关系

{chr(10).join(parts_text)}

## 核心依赖关系
{chr(10).join(deps_text) if deps_text else "(无显式依赖)"}

## 层级分布
{json.dumps(summary.layer_distribution, ensure_ascii=False)}

## 章节规划原则

1. **按认知递进组织**（算法已保证前置依赖顺序）
2. **每章聚焦一个核心概念**，不要一章塞太多
3. **每章必须有**：id (ch01-xxx 格式), title, subtitle, sources, prerequisites, outline, kg_coverage (覆盖的知识图谱节点 id 列表)
4. 请用 Read/Glob/Grep 工具探索源码以确定 sources 字段

## 输出要求

直接输出一个 JSON 对象（不要代码块包裹）：

{{
  "project_name": "项目展示名",
  "description": "一句话简介",
  "parts": [
    {{
      "part_num": 1,
      "part_title": "Part 1 - 标题",
      "community_id": "c0",
      "chapters": [
        {{
          "id": "ch01-xxx",
          "title": "第1章：XXX",
          "subtitle": "副标题",
          "sources": "src/main.ts,src/entry",
          "prerequisites": [],
          "outline": "- 开篇场景\\n- 核心概念\\n- 代码解读\\n- 总结",
          "kg_coverage": ["concept-xxx", "workflow-yyy"]
        }}
      ]
    }}
  ]
}}"""


async def plan_from_graph(
    kg_path: Path,
    scan: Any,
    repo_path: Path,
    project_name: str,
    completeness: float = 1.0,
    precomputed_summary: GraphSummary | None = None,
    precomputed_algo_plan: AlgorithmicPlan | None = None,
) -> dict[str, Any]:
    """Full graph-driven planning pipeline: extract → algorithm → LLM → output.

    Accepts pre-computed summary and algo_plan to avoid redundant work when
    the caller (e.g. init_project) has already computed them.
    """
    from pyharness.claude_client import ClaudeClient
    from pyharness.init import _generate_fallback_skeleton, extract_json_from_response

    if precomputed_summary is not None:
        summary = precomputed_summary
        log("OK", f"Using pre-computed summary: {len(summary.semantic_nodes)} semantic nodes, {len(summary.semantic_edges)} edges")
    else:
        log("STEP", "Extracting graph summary...", phase="graph-plan")
        summary = extract_graph_summary(kg_path)
        log("OK", f"Found {len(summary.semantic_nodes)} semantic nodes, {len(summary.semantic_edges)} edges")

    if not summary.semantic_nodes:
        log("WARN", "No semantic nodes in knowledge graph, falling back to skeleton")
        return _generate_fallback_skeleton(scan)

    if precomputed_algo_plan is not None:
        algo_plan = precomputed_algo_plan
        log("OK", f"Using pre-computed algorithmic plan: {len(algo_plan.communities)} communities, {len(algo_plan.topo_order)} topo nodes")
    else:
        log("STEP", "Computing algorithmic plan (community detection + topo sort)...", phase="graph-plan")
        algo_plan = compute_algorithmic_plan(summary)
        log("OK", f"Communities: {len(algo_plan.communities)}, Topo order: {len(algo_plan.topo_order)} nodes")
    if algo_plan.cycle_breaks:
        log("WARN", f"Broke {len(algo_plan.cycle_breaks)} cycle(s)")
    log_event("graph_plan_algorithm", {
        "communities": len(algo_plan.communities),
        "topo_order_length": len(algo_plan.topo_order),
        "cycle_breaks": len(algo_plan.cycle_breaks),
    })

    log("STEP", "Building planning prompt...", phase="graph-plan")
    prompt = build_graph_planning_prompt(algo_plan, summary, scan)

    if completeness < 1.0:
        prompt += f"\n\n注意：当前图谱仅覆盖约 {int(completeness * 100)}% 的代码库分析，可能遗漏部分概念。"

    log("STEP", "Calling Claude for chapter planning...", phase="graph-plan")
    try:
        timeout = int(os.environ.get("CLAUDE_TIMEOUT", "600"))
        client = ClaudeClient(cwd=repo_path, timeout=timeout)
        result = await client.run(prompt, max_turns=30)
    except Exception as exc:
        log("WARN", f"Claude planning failed: {exc}, falling back to skeleton")
        return _generate_fallback_skeleton(scan)

    if result is None:
        log("WARN", "Claude returned empty, falling back to skeleton")
        return _generate_fallback_skeleton(scan)

    parsed = extract_json_from_response(str(result))
    if parsed and "parts" in parsed:
        log("OK", f"Graph-driven plan: {len(parsed['parts'])} parts")
        return parsed

    log("WARN", "Claude failed to produce valid JSON, falling back to skeleton")
    return _generate_fallback_skeleton(scan)


def write_chapter_outline(
    plan: dict[str, Any],
    algo_plan: AlgorithmicPlan | None,
    summary: GraphSummary | None,
    outline_path: Path,
) -> None:
    """Write chapter-outline.json alongside knowledge-graph.json."""
    parts: list[OutlinePart] = []
    all_covered: set[str] = set()

    for p in plan.get("parts", []):
        chapters: list[OutlineChapter] = []
        for ch in p.get("chapters", []):
            coverage = ch.get("kg_coverage", [])
            all_covered.update(coverage)
            chapters.append(OutlineChapter(
                id=ch.get("id", ""),
                title=ch.get("title", ""),
                subtitle=ch.get("subtitle", ""),
                kg_coverage=coverage,
                prerequisites=ch.get("prerequisites", []),
                topo_rank=0,
                sources=ch.get("sources", ""),
                outline=ch.get("outline", ""),
            ))
        parts.append(OutlinePart(
            part_num=p.get("part_num", 0),
            part_title=p.get("part_title", ""),
            community_id=p.get("community_id", ""),
            kg_node_ids=[],
            chapters=chapters,
        ))

    uncovered: list[str] = []
    if summary:
        all_semantic = {n.id for n in summary.semantic_nodes}
        uncovered = sorted(all_semantic - all_covered)

    outline = ChapterOutline(
        generated_at=datetime.now(timezone.utc).isoformat(),
        algorithm={
            "community_method": algo_plan.community_method if algo_plan else "none",
            "num_communities": len(algo_plan.communities) if algo_plan else 0,
            "topo_sort_valid": bool(algo_plan and not algo_plan.cycle_breaks) if algo_plan else False,
        },
        parts=parts,
        uncovered_nodes=uncovered,
    )

    outline_path.parent.mkdir(parents=True, exist_ok=True)
    outline_path.write_text(
        json.dumps(outline.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log("OK", f"Chapter outline written to {outline_path}")
    if uncovered:
        log("INFO", f"Uncovered semantic nodes: {len(uncovered)}")


def load_chapter_outline(knowledge_dir: Path) -> ChapterOutline | None:
    """Load chapter-outline.json if it exists."""
    path = knowledge_dir / "chapter-outline.json"
    if not path.exists():
        return None
    try:
        return ChapterOutline.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception:
        return None

"""Deterministic quality validation for knowledge graphs.

Runs pure-Python checks (no LLM calls) to catch common issues
after batch merging and before chapter planning.

Reference: Understand-Anything Graph Reviewer pattern.
"""

from __future__ import annotations

from pyharness.log import log, log_event
from pyharness.schemas import GraphWarning, KnowledgeGraph

SEMANTIC_TYPES = frozenset({"Concept", "Workflow", "DataModel", "Component", "CodeEntity"})

LAYER_HINTS: dict[str, list[str]] = {
    "api": ["api", "route", "handler", "endpoint", "controller"],
    "service": ["service", "usecase", "logic", "manager"],
    "data": ["model", "schema", "entity", "repository", "store", "db", "migration"],
    "ui": ["component", "page", "view", "layout", "widget", "screen"],
    "infra": ["config", "docker", "deploy", "ci", "infra", "terraform", "k8s"],
    "util": ["util", "helper", "lib", "common", "shared", "tool"],
}


def _normalized_similarity(a: str, b: str) -> float:
    """Normalized edit distance similarity (1.0 = identical)."""
    a_lower = a.lower().strip()
    b_lower = b.lower().strip()
    if a_lower == b_lower:
        return 1.0
    max_len = max(len(a_lower), len(b_lower))
    if max_len == 0:
        return 1.0
    # Simple Levenshtein
    m, n = len(a_lower), len(b_lower)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if a_lower[i - 1] == b_lower[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return 1.0 - dp[n] / max_len


def _infer_layer(file_path: str) -> str | None:
    """Heuristic layer inference from file path segments."""
    parts = file_path.lower().replace("\\", "/").split("/")
    for layer_id, keywords in LAYER_HINTS.items():
        for part in parts:
            if any(kw in part for kw in keywords):
                return layer_id
    return None


def validate_graph(graph: KnowledgeGraph) -> list[GraphWarning]:
    """Run deterministic quality checks on a merged knowledge graph."""
    warnings: list[GraphWarning] = []
    node_map = {n.id: n for n in graph.nodes}
    connected_ids = {e.source for e in graph.edges} | {e.target for e in graph.edges}

    semantic_nodes = [n for n in graph.nodes if n.type in SEMANTIC_TYPES]

    # Check 1: Orphaned semantic nodes
    orphans = [n for n in semantic_nodes if n.id not in connected_ids]
    for n in orphans:
        warnings.append(GraphWarning(
            type="orphan_semantic_node",
            severity="warn",
            node_ids=[n.id],
            message=f"Semantic node '{n.name}' ({n.type}) has no edges",
        ))

    # Check 2: Dangling edges
    for e in graph.edges:
        missing = []
        if e.source not in node_map:
            missing.append(f"source '{e.source}'")
        if e.target not in node_map:
            missing.append(f"target '{e.target}'")
        if missing:
            warnings.append(GraphWarning(
                type="dangling_edge",
                severity="warn",
                node_ids=[e.source, e.target],
                message=f"Edge {e.source}->{e.target} has missing {', '.join(missing)}",
            ))

    # Check 3: Suspected duplicates
    for i, a in enumerate(semantic_nodes):
        for b in semantic_nodes[i + 1:]:
            if a.type == b.type and _normalized_similarity(a.name, b.name) > 0.85:
                warnings.append(GraphWarning(
                    type="suspected_duplicate",
                    severity="info",
                    node_ids=[a.id, b.id],
                    message=f"Possible duplicate: '{a.name}' and '{b.name}' ({a.type})",
                ))

    # Check 4: Layer assignment anomaly
    for n in graph.nodes:
        if n.type == "file" and n.layer:
            inferred = _infer_layer(n.id)
            if inferred and inferred != n.layer:
                warnings.append(GraphWarning(
                    type="layer_mismatch",
                    severity="info",
                    node_ids=[n.id],
                    message=f"File '{n.id}' layer='{n.layer}' but path suggests '{inferred}'",
                ))

    # Check 5: Disconnected semantic subgraph
    if semantic_nodes:
        semantic_ids = {n.id for n in semantic_nodes}
        adj: dict[str, set[str]] = {nid: set() for nid in semantic_ids}
        for e in graph.edges:
            if e.source in semantic_ids and e.target in semantic_ids:
                adj[e.source].add(e.target)
                adj[e.target].add(e.source)

        visited: set[str] = set()
        components = 0
        for start in semantic_ids:
            if start in visited:
                continue
            components += 1
            stack = [start]
            while stack:
                cur = stack.pop()
                if cur in visited:
                    continue
                visited.add(cur)
                stack.extend(adj[cur] - visited)

        if components > 1:
            warnings.append(GraphWarning(
                type="disconnected_components",
                severity="info",
                node_ids=[],
                message=f"Semantic subgraph has {components} disconnected components",
            ))

    return warnings


def log_validation_results(graph: KnowledgeGraph, warnings: list[GraphWarning]) -> None:
    """Log warnings and emit SSE event only for severe orphan ratios."""
    if not warnings:
        log("OK", "Graph validation passed: no issues found")
        return

    by_type: dict[str, int] = {}
    for w in warnings:
        by_type[w.type] = by_type.get(w.type, 0) + 1
        if w.severity == "warn":
            log("WARN", f"[{w.type}] {w.message}")
        else:
            log("INFO", f"[{w.type}] {w.message}")

    orphan_count = by_type.get("orphan_semantic_node", 0)
    semantic_count = sum(1 for node in graph.nodes if node.type in SEMANTIC_TYPES)
    orphan_ratio = (orphan_count / semantic_count) if semantic_count else 0.0
    total_warnings = len(warnings)
    log("INFO", f"Graph validation: {total_warnings} issue(s) — {by_type}")

    if semantic_count and orphan_ratio > 0.3:
        log_event("graph_validate", {
            "total_warnings": total_warnings,
            "orphan_count": orphan_count,
            "semantic_count": semantic_count,
            "orphan_ratio": orphan_ratio,
            "by_type": by_type,
        })

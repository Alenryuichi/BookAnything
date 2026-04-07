"""Tests for graph validation severity handling."""

from pyharness.graph_validate import log_validation_results, validate_graph
from pyharness.schemas import GraphEdge, GraphNode, KnowledgeGraph


def _make_graph(orphan_count: int, semantic_count: int = 10) -> KnowledgeGraph:
    connected_count = semantic_count - orphan_count
    nodes = [
        GraphNode(id=f"concept-{i}", type="Concept", name=f"Concept {i}")
        for i in range(semantic_count)
    ]
    edges = [
        GraphEdge(
            source=f"concept-{i}",
            target=f"concept-{i + 1}",
            type="DEPENDS_ON",
        )
        for i in range(max(connected_count - 1, 0))
    ]
    return KnowledgeGraph(nodes=nodes, edges=edges)


def test_log_validation_results_emits_event_above_orphan_threshold(monkeypatch):
    graph = _make_graph(orphan_count=4, semantic_count=10)
    warnings = validate_graph(graph)
    events = []

    monkeypatch.setattr("pyharness.graph_validate.log_event", lambda name, payload: events.append((name, payload)))

    log_validation_results(graph, warnings)

    assert len(events) == 1
    name, payload = events[0]
    assert name == "graph_validate"
    assert payload["orphan_count"] == 4
    assert payload["semantic_count"] == 10
    assert payload["orphan_ratio"] > 0.3


def test_log_validation_results_skips_event_below_orphan_threshold(monkeypatch):
    graph = _make_graph(orphan_count=2, semantic_count=10)
    warnings = validate_graph(graph)
    events = []

    monkeypatch.setattr("pyharness.graph_validate.log_event", lambda name, payload: events.append((name, payload)))

    log_validation_results(graph, warnings)

    assert events == []

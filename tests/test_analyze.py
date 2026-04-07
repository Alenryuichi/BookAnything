"""Tests for semantic knowledge graph analysis phases."""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from pyharness.phases.analyze import _build_batch_prompt, _run_global_discovery, _merge_batches
from pyharness.schemas import (
    BatchFileResult,
    BatchResult,
    FileEntry,
    GlobalConcept,
    GlobalDiscoveryResult,
    StaticEdge,
    StaticGraph,
    StaticNode,
)

@pytest.mark.asyncio
async def test_run_global_discovery():
    mock_client = AsyncMock()
    mock_client.run.return_value = GlobalDiscoveryResult(
        concepts=[
            GlobalConcept(id="workflow-auth", type="Workflow", name="Auth Flow", layer="service"),
            GlobalConcept(id="model-user", type="DataModel", name="User Model", layer="data"),
        ]
    )

    files = [FileEntry(path="auth.py", language="python", line_count=100, size_bytes=1000)]
    concepts = await _run_global_discovery(mock_client, files, "test-repo")
    
    assert len(concepts) == 2
    assert concepts[0].id == "workflow-auth"
    assert concepts[1].type == "DataModel"

def test_merge_batches_with_semantic_edges():
    batches = [
        BatchResult(
            files=[
                BatchFileResult(
                    id="auth.py",
                    name="Auth",
                    edges=[
                        {"source": "auth.py", "target": "workflow-auth", "type": "IMPLEMENTS"}
                    ],
                )
            ]
        )
    ]
    
    files = [FileEntry(path="auth.py", language="python")]
    concepts = [
        GlobalConcept(id="workflow-auth", type="Workflow", name="Auth Flow", layer="service")
    ]
    
    graph = _merge_batches(batches, files, concepts)
    
    assert len(graph.nodes) == 2  # auth.py + workflow-auth
    assert graph.nodes[0].id == "workflow-auth"
    assert graph.nodes[0].type == "Workflow"
    
    # Imports are added automatically but no import edge in this batch
    assert len(graph.edges) == 1
    edge = graph.edges[0]
    assert edge.source == "auth.py"
    assert edge.target == "workflow-auth"
    assert edge.type == "IMPLEMENTS"


def test_build_batch_prompt_prefers_static_summary(tmp_path: Path):
    repo = tmp_path / "repo"
    repo.mkdir()
    source = repo / "auth.py"
    source.write_text("import os\n\ndef login(user):\n    return user\n")

    batch = [FileEntry(path="auth.py", language="python", line_count=3, size_bytes=32)]
    static_graph = StaticGraph(
        nodes=[
            StaticNode(id="auth.py", type="file", name="auth.py", file_path="auth.py", language="python", line_start=1, line_end=3),
            StaticNode(
                id="auth.py::login",
                type="function",
                name="login",
                file_path="auth.py",
                language="python",
                line_start=3,
                line_end=4,
                signature="def login(user)",
                parent_id="auth.py",
            ),
        ],
        edges=[
            StaticEdge(source="auth.py", target="os", type="static_import", label="import os"),
            StaticEdge(source="auth.py", target="auth.py::login", type="static_contains"),
        ],
    )

    prompt = _build_batch_prompt(batch, repo, "demo", static_graph=static_graph)

    assert "STATIC SUMMARY" in prompt
    assert "Imports: os" in prompt
    assert "function login" in prompt
    assert "return user" not in prompt


def test_build_batch_prompt_falls_back_to_raw_source_without_static_coverage(tmp_path: Path):
    repo = tmp_path / "repo"
    repo.mkdir()
    source = repo / "auth.py"
    source.write_text("import os\n\ndef login(user):\n    return user\n")

    batch = [FileEntry(path="auth.py", language="python", line_count=3, size_bytes=32)]
    static_graph = StaticGraph()

    prompt = _build_batch_prompt(batch, repo, "demo", static_graph=static_graph)

    assert "RAW SOURCE FALLBACK" in prompt
    assert "return user" in prompt

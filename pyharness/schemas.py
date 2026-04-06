"""Pydantic models for all harness JSON schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ── Plan output ──

class ChapterToWrite(BaseModel):
    id: str
    focus: str = ""


class PlanOutput(BaseModel):
    plan_summary: str = ""
    chapters_to_write: list[ChapterToWrite] = Field(default_factory=list)
    needs_webapp_improve: bool = True
    webapp_improve_focus: Optional[str] = "none"
    improvement_focus: Optional[str] = "coverage"


# ── Chapter JSON ──

class CodeSnippet(BaseModel):
    title: str = ""
    description: str = ""
    code: str = ""
    language: str = "typescript"
    annotation: str = ""


class Diagram(BaseModel):
    title: str = ""
    chart: str = ""
    description: str = ""


class Callout(BaseModel):
    type: str = "info"
    text: str = ""


class Table(BaseModel):
    caption: str = ""
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class Section(BaseModel):
    heading: str = ""
    content: str = ""
    code: Optional[CodeSnippet] = None
    diagram: Optional[Diagram] = None
    callout: Optional[Callout] = None
    table: Optional[Table] = None


class ChapterJSON(BaseModel):
    chapter_id: str
    title: str
    subtitle: str = ""
    chapter_summary: str = ""
    opening_hook: str = ""
    sections: list[Section] = Field(default_factory=list)
    key_takeaways: list[str] = Field(default_factory=list)
    further_thinking: list[str] = Field(default_factory=list)
    analogies: list[str] = Field(default_factory=list)
    mermaid_diagrams: list[Any] = Field(default_factory=list)
    code_snippets: list[Any] = Field(default_factory=list)
    word_count: int = 0
    prerequisites: list[str] = Field(default_factory=list)


# ── Evaluation ──

class ContentBreakdown(BaseModel):
    coverage: int = 0
    volume: int = 0
    depth: int = 0


class VisualBreakdown(BaseModel):
    build: int = 0
    no_errors: int = 0
    mermaid: int = 0
    layout: int = 0


class InteractionBreakdown(BaseModel):
    search: int = 0
    navigation: int = 0
    code_highlight: int = 0
    page_routing: int = 0


class DimensionEval(BaseModel):
    dimension: str
    score: int = 0
    max_score: int
    breakdown: dict[str, int] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class ScoresBreakdown(BaseModel):
    content: int = 0
    visual: int = 0
    interaction: int = 0


class DimensionDetail(BaseModel):
    score: int = 0
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class MergedEval(BaseModel):
    score: int = 0
    scores: ScoresBreakdown = Field(default_factory=ScoresBreakdown)
    content: DimensionDetail = Field(default_factory=DimensionDetail)
    visual: DimensionDetail = Field(default_factory=DimensionDetail)
    interaction: DimensionDetail = Field(default_factory=DimensionDetail)

    def format_feedback(self) -> str:
        parts = [
            f"总分: {self.score}/100 | 内容: {self.scores.content}/40 | 视觉: {self.scores.visual}/35 | 交互: {self.scores.interaction}/25",
            f"内容问题: {'; '.join(self.content.issues) or '无'}",
            f"视觉问题: {'; '.join(self.visual.issues) or '无'}",
            f"交互问题: {'; '.join(self.interaction.issues) or '无'}",
            f"内容建议: {'; '.join(self.content.suggestions) or '无'}",
            f"视觉建议: {'; '.join(self.visual.suggestions) or '无'}",
            f"交互建议: {'; '.join(self.interaction.suggestions) or '无'}",
        ]
        return "\n".join(parts)


# ── Harness state ──

class ScoreRecord(BaseModel):
    iteration: int
    total: int = 0
    content: int = 0
    visual: int = 0
    interaction: int = 0
    time: Optional[str] = None


class FailedChapter(BaseModel):
    chapter_id: str
    error_class: str
    error_message: str = ""
    iteration: int = 0
    attempts: int = 0


class HarnessState(BaseModel):
    iteration: int = 0
    score: int = 0
    scores: ScoresBreakdown = Field(default_factory=ScoresBreakdown)
    phase: str = "init"
    start_time: Optional[str] = None
    modules_analyzed: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    failed_chapters: list[FailedChapter] = Field(default_factory=list)
    history: list[ScoreRecord] = Field(default_factory=list)


# ── Knowledge Graph ──

LAYER_IDS = ("api", "service", "data", "ui", "infra", "util")

class GraphNodeChild(BaseModel):
    """A class, function, or method inside a file."""
    id: str
    type: Literal["class", "function", "method", "constant"]
    name: str
    summary: str = ""
    signature: str = ""
    line_start: int = 0
    line_end: int = 0
    children: list["GraphNodeChild"] = Field(default_factory=list)


class GraphNode(BaseModel):
    """A node in the semantic knowledge graph."""
    id: str
    type: Literal["Concept", "Workflow", "DataModel", "Component", "CodeEntity", "file", "directory"] = "file"
    name: str
    layer: str = "util"
    summary: str = ""
    language: str = ""
    line_count: int = 0
    imports: list[dict[str, Any]] = Field(default_factory=list)
    children: list[GraphNodeChild] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    type: Literal["import", "call", "extend", "implement", "compose", "IMPLEMENTS", "MUTATES", "TRIGGERS", "DEPENDS_ON", "DESCRIBES"] = "import"
    label: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class ArchLayer(BaseModel):
    id: str
    name: str
    color: str


class KnowledgeGraphStats(BaseModel):
    total_files: int = 0
    total_functions: int = 0
    total_classes: int = 0
    total_edges: int = 0


class TourStep(BaseModel):
    node_id: str
    narrative: str = ""


class GuidedTour(BaseModel):
    id: str
    name: str
    description: str = ""
    steps: list[TourStep] = Field(default_factory=list)


class KnowledgeGraph(BaseModel):
    version: str = "1.0"
    repo: str = ""
    generated_at: str = ""
    stats: KnowledgeGraphStats = Field(default_factory=KnowledgeGraphStats)
    layers: list[ArchLayer] = Field(default_factory=list)
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    tours: list[GuidedTour] = Field(default_factory=list)
    chapter_links: dict[str, list[str]] = Field(default_factory=dict)


# ── Analyze helpers ──

class FileEntry(BaseModel):
    """A source file discovered during tree scan."""
    path: str
    language: str = ""
    line_count: int = 0
    size_bytes: int = 0


class BatchFileResult(BaseModel):
    """Analysis result for a single file within a batch."""
    id: str
    type: str = "file"
    name: str = ""
    layer: str = "util"
    summary: str = ""
    language: str = ""
    line_count: int = 0
    imports: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    children: list[dict[str, Any]] = Field(default_factory=list)


class BatchResult(BaseModel):
    """Claude batch analysis output."""
    files: list[BatchFileResult] = Field(default_factory=list)

class GlobalConcept(BaseModel):
    id: str
    type: Literal["Concept", "Workflow", "DataModel", "Component"]
    name: str
    summary: str = ""
    layer: str = "util"

class GlobalDiscoveryResult(BaseModel):
    concepts: list[GlobalConcept] = Field(default_factory=list)


# ── Static Graph (tree-sitter deterministic layer) ──

class StaticNode(BaseModel):
    """A node extracted by tree-sitter AST parsing."""
    id: str
    type: Literal["file", "class", "function", "method", "import"] = "file"
    name: str
    language: str = ""
    file_path: str = ""
    line_start: int = 0
    line_end: int = 0
    signature: str = ""
    parent_id: str = ""


class StaticEdge(BaseModel):
    """An edge extracted deterministically from AST."""
    source: str
    target: str
    type: Literal["static_import", "static_call", "static_inherits", "static_contains"] = "static_import"
    label: str = ""


class StaticGraph(BaseModel):
    """Deterministic structural graph from tree-sitter parsing."""
    version: str = "1.0"
    generated_at: str = ""
    nodes: list[StaticNode] = Field(default_factory=list)
    edges: list[StaticEdge] = Field(default_factory=list)
    file_hashes: dict[str, str] = Field(default_factory=dict)
    languages_parsed: list[str] = Field(default_factory=list)
    languages_skipped: list[str] = Field(default_factory=list)


# ── Graph Validation ──

class GraphWarning(BaseModel):
    """A quality issue detected during graph validation."""
    type: Literal[
        "orphan_semantic_node",
        "dangling_edge",
        "suspected_duplicate",
        "layer_mismatch",
        "disconnected_components",
    ]
    severity: Literal["info", "warn", "error"] = "warn"
    node_ids: list[str] = Field(default_factory=list)
    message: str = ""


# ── Algorithmic Plan (community detection + topo sort) ──

class Community(BaseModel):
    """A group of semantically related nodes detected by graph algorithms."""
    id: str
    node_ids: list[str] = Field(default_factory=list)
    label: str = ""


class AlgorithmicPlan(BaseModel):
    """Output of deterministic graph algorithms for chapter planning."""
    communities: list[Community] = Field(default_factory=list)
    topo_order: list[str] = Field(default_factory=list)
    centrality: dict[str, float] = Field(default_factory=dict)
    cycle_breaks: list[tuple[str, str]] = Field(default_factory=list)
    community_method: str = "louvain"


class GraphSummary(BaseModel):
    """Extracted semantic summary from knowledge-graph.json."""
    semantic_nodes: list[GraphNode] = Field(default_factory=list)
    semantic_edges: list[GraphEdge] = Field(default_factory=list)
    file_nodes: list[GraphNode] = Field(default_factory=list)
    layer_distribution: dict[str, int] = Field(default_factory=dict)
    total_nodes: int = 0
    total_edges: int = 0


# ── Chapter Outline (dual graph separation) ──

class OutlineChapter(BaseModel):
    """A chapter in the chapter-outline.json."""
    id: str
    title: str = ""
    subtitle: str = ""
    kg_coverage: list[str] = Field(default_factory=list)
    prerequisites: list[str] = Field(default_factory=list)
    topo_rank: int = 0
    sources: str = ""
    outline: str = ""


class OutlinePart(BaseModel):
    """A part in the chapter-outline.json."""
    part_num: int
    part_title: str = ""
    community_id: str = ""
    kg_node_ids: list[str] = Field(default_factory=list)
    chapters: list[OutlineChapter] = Field(default_factory=list)


class ChapterOutline(BaseModel):
    """The chapter-outline.json schema — separate from knowledge-graph.json."""
    version: str = "1.0"
    generated_at: str = ""
    algorithm: dict[str, Any] = Field(default_factory=dict)
    parts: list[OutlinePart] = Field(default_factory=list)
    uncovered_nodes: list[str] = Field(default_factory=list)

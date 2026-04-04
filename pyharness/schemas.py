"""Pydantic models for all harness JSON schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

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


class HarnessState(BaseModel):
    iteration: int = 0
    score: int = 0
    scores: ScoresBreakdown = Field(default_factory=ScoresBreakdown)
    phase: str = "init"
    start_time: Optional[str] = None
    modules_analyzed: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    history: list[ScoreRecord] = Field(default_factory=list)

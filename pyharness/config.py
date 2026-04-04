"""Project config loading from YAML."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import yaml
from pydantic import BaseModel, Field


class ChapterConfig(BaseModel):
    id: str
    title: str = ""
    subtitle: str = ""
    sources: str = ""
    prerequisites: list[str] = Field(default_factory=list)
    outline: str = ""


class BookConfig(BaseModel):
    title: str = ""
    subtitle: str = ""
    stats: dict[str, Any] = Field(default_factory=dict)


class ProjectConfig(BaseModel):
    name: str
    repo_path: str
    target_dir: str = "src"
    language: str = "TypeScript"
    description: str = ""
    book: BookConfig = Field(default_factory=BookConfig)
    chapters: list[ChapterConfig] = Field(default_factory=list)

    @property
    def book_title(self) -> str:
        return self.book.title or f"深入理解 {self.name}"

    @property
    def total_chapters(self) -> int:
        return len(self.chapters)

    def get_chapter(self, chapter_id: str) -> Optional[ChapterConfig]:
        for ch in self.chapters:
            if ch.id == chapter_id:
                return ch
        return None

    def get_all_chapter_ids(self) -> list[str]:
        return [ch.id for ch in self.chapters]


def load_project_config(path: Path) -> ProjectConfig:
    with open(path) as f:
        data = yaml.safe_load(f)
    return ProjectConfig(**data)

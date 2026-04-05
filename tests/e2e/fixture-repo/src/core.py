"""Core abstractions: Token, Stage, Pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from typing import Any


@dataclass
class Token:
    """Atomic unit of text flowing through the pipeline."""
    text: str
    kind: str = "word"
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def length(self) -> int:
        return len(self.text)

    def clone(self, **overrides: Any) -> Token:
        data = {"text": self.text, "kind": self.kind, "metadata": {**self.metadata}}
        data.update(overrides)
        return Token(**data)


class Stage(ABC):
    """Base class for all pipeline stages.

    Each stage receives a list of tokens and returns a (possibly modified)
    list of tokens. Stages are composable via Pipeline.
    """

    @abstractmethod
    def process(self, tokens: list[Token]) -> list[Token]:
        ...

    @property
    def name(self) -> str:
        return type(self).__name__


class Pipeline:
    """Ordered sequence of stages that processes text end-to-end.

    Implements the Chain of Responsibility pattern: each stage can
    modify, filter, or expand the token stream before passing it on.
    """

    def __init__(self, stages: list[Stage] | None = None) -> None:
        self._stages: list[Stage] = list(stages or [])

    def add(self, stage: Stage) -> Pipeline:
        self._stages.append(stage)
        return self

    def run(self, text: str) -> str:
        from .tokenizer import TokenizerStage
        from .formatter import PlainFormatter

        tokens = TokenizerStage().process([Token(text=text)])
        for stage in self._stages:
            if isinstance(stage, TokenizerStage):
                continue
            tokens = stage.process(tokens)
        formatter = next(
            (s for s in self._stages if hasattr(s, "format")),
            PlainFormatter(),
        )
        return formatter.format(tokens)

    @property
    def stage_names(self) -> list[str]:
        return [s.name for s in self._stages]

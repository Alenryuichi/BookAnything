"""Built-in transform stages that modify token content."""

from __future__ import annotations

from .core import Token, Stage


class UpperTransform(Stage):
    """Convert all word tokens to uppercase."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return [
            tok.clone(text=tok.text.upper()) if tok.kind == "word" else tok
            for tok in tokens
        ]


class LowerTransform(Stage):
    """Convert all word tokens to lowercase."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return [
            tok.clone(text=tok.text.lower()) if tok.kind == "word" else tok
            for tok in tokens
        ]


class ReverseTransform(Stage):
    """Reverse the text of each word token."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return [
            tok.clone(text=tok.text[::-1]) if tok.kind == "word" else tok
            for tok in tokens
        ]


class FilterStage(Stage):
    """Remove tokens shorter than a minimum length."""

    def __init__(self, min_length: int = 2) -> None:
        self.min_length = min_length

    def process(self, tokens: list[Token]) -> list[Token]:
        return [tok for tok in tokens if tok.length >= self.min_length]

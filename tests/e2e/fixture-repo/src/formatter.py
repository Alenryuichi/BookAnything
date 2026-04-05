"""Formatter stages: convert token lists back to output strings."""

from __future__ import annotations

import json
from .core import Token, Stage


class PlainFormatter(Stage):
    """Join tokens with spaces."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return tokens

    def format(self, tokens: list[Token]) -> str:
        return " ".join(tok.text for tok in tokens)


class MarkdownFormatter(Stage):
    """Format tokens as a Markdown code block."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return tokens

    def format(self, tokens: list[Token]) -> str:
        body = " ".join(tok.text for tok in tokens)
        return f"```\n{body}\n```"


class JsonFormatter(Stage):
    """Format tokens as a JSON array of objects."""

    def process(self, tokens: list[Token]) -> list[Token]:
        return tokens

    def format(self, tokens: list[Token]) -> str:
        items = [{"text": t.text, "kind": t.kind} for t in tokens]
        return json.dumps(items, ensure_ascii=False, indent=2)

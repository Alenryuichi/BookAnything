"""Tokenizer stage: splits raw text into Token objects."""

from __future__ import annotations

import re
from .core import Token, Stage

WORD_RE = re.compile(r"\S+")
PUNCT = set(".,;:!?\"'()[]{}–—")


class TokenizerStage(Stage):
    """Split input text into word and punctuation tokens."""

    def __init__(self, split_punct: bool = True) -> None:
        self.split_punct = split_punct

    def process(self, tokens: list[Token]) -> list[Token]:
        result: list[Token] = []
        for tok in tokens:
            for match in WORD_RE.finditer(tok.text):
                word = match.group()
                if self.split_punct and len(word) > 1:
                    head, tail = self._strip_punct(word)
                    if head:
                        result.append(Token(text=head, kind="punct"))
                    result.append(Token(text=tail[0], kind="word"))
                    if len(tail) > 1 and tail[-1] in PUNCT:
                        result.append(Token(text=tail[-1], kind="punct"))
                    elif len(tail) > 1:
                        result.append(Token(text=tail, kind="word"))
                else:
                    kind = "punct" if word in PUNCT else "word"
                    result.append(Token(text=word, kind=kind))
        return result

    @staticmethod
    def _strip_punct(word: str) -> tuple[str, str]:
        head = ""
        if word[0] in PUNCT:
            head = word[0]
            word = word[1:]
        return head, word

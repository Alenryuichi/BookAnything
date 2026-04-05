"""CLI entry point for MiniPipe."""

from __future__ import annotations

import argparse
import sys

from .core import Pipeline
from .tokenizer import TokenizerStage
from .transforms import UpperTransform, LowerTransform, ReverseTransform
from .formatter import PlainFormatter, MarkdownFormatter, JsonFormatter


FORMATTERS = {
    "plain": PlainFormatter,
    "markdown": MarkdownFormatter,
    "json": JsonFormatter,
}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="minipipe", description="Pipeline text processor")
    p.add_argument("text", nargs="?", default="-", help="Input text (or - for stdin)")
    p.add_argument("--upper", action="store_true", help="Uppercase transform")
    p.add_argument("--lower", action="store_true", help="Lowercase transform")
    p.add_argument("--reverse", action="store_true", help="Reverse each word")
    p.add_argument("--format", choices=FORMATTERS, default="plain", help="Output format")
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

    text = sys.stdin.read() if args.text == "-" else args.text

    stages = [TokenizerStage()]
    if args.upper:
        stages.append(UpperTransform())
    if args.lower:
        stages.append(LowerTransform())
    if args.reverse:
        stages.append(ReverseTransform())
    stages.append(FORMATTERS[args.format]())

    pipe = Pipeline(stages)
    print(pipe.run(text))


if __name__ == "__main__":
    main()

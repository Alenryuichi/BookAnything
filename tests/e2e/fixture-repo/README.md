# MiniPipe

A minimal pipeline-based text processing library.

## Architecture

MiniPipe uses a pipeline pattern where text flows through a series of
configurable stages: **Tokenizer → Transformer → Formatter**.

```
Input text → Tokenizer → [Token, ...] → Transformer → [Token, ...] → Formatter → Output text
```

## Usage

```python
from minipipe import Pipeline, TokenizerStage, UpperTransform, MarkdownFormatter

pipe = Pipeline([
    TokenizerStage(),
    UpperTransform(),
    MarkdownFormatter(),
])
result = pipe.run("hello world")
```

## CLI

```bash
python -m minipipe "hello world" --upper --format markdown
```

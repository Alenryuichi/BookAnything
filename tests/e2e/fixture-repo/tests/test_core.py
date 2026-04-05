"""Tests for core abstractions."""

from src.core import Token, Pipeline
from src.tokenizer import TokenizerStage
from src.transforms import UpperTransform


def test_token_clone():
    t = Token(text="hello", kind="word")
    t2 = t.clone(text="HELLO")
    assert t2.text == "HELLO"
    assert t2.kind == "word"
    assert t.text == "hello"


def test_pipeline_basic():
    pipe = Pipeline([TokenizerStage(), UpperTransform()])
    result = pipe.run("hello world")
    assert "HELLO" in result
    assert "WORLD" in result

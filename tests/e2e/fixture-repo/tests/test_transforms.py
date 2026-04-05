"""Tests for transform stages."""

from src.core import Token
from src.transforms import UpperTransform, LowerTransform, ReverseTransform, FilterStage


def test_upper():
    tokens = [Token(text="hello", kind="word")]
    result = UpperTransform().process(tokens)
    assert result[0].text == "HELLO"


def test_lower():
    tokens = [Token(text="HELLO", kind="word")]
    result = LowerTransform().process(tokens)
    assert result[0].text == "hello"


def test_reverse():
    tokens = [Token(text="hello", kind="word")]
    result = ReverseTransform().process(tokens)
    assert result[0].text == "olleh"


def test_filter():
    tokens = [Token(text="a"), Token(text="hello"), Token(text="hi")]
    result = FilterStage(min_length=2).process(tokens)
    assert len(result) == 2

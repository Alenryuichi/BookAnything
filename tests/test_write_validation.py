"""Tests for write-phase JSON validation and auto-repair logic."""

from __future__ import annotations

import json
import pytest

from pyharness.phases.write import (
    _extract_chapter_json,
    _try_repair_json,
    validate_chapter,
)


# ── _extract_chapter_json ──


class TestExtractChapterJson:
    def test_plain_json(self):
        raw = '{"chapter_id": "ch01"}'
        assert _extract_chapter_json(raw) == '{"chapter_id": "ch01"}'

    def test_strips_markdown_fences(self):
        raw = '```json\n{"chapter_id": "ch01"}\n```'
        assert _extract_chapter_json(raw) == '{"chapter_id": "ch01"}'

    def test_strips_fences_no_language(self):
        raw = '```\n{"chapter_id": "ch01"}\n```'
        assert _extract_chapter_json(raw) == '{"chapter_id": "ch01"}'

    def test_strips_whitespace(self):
        raw = '  \n {"chapter_id": "ch01"}  \n'
        assert _extract_chapter_json(raw) == '{"chapter_id": "ch01"}'


# ── _try_repair_json ──


class TestTryRepairJson:
    def test_trailing_comma_in_array(self):
        raw = '{"items": ["a", "b",]}'
        result = _try_repair_json(raw)
        assert result is not None
        assert json.loads(result) == {"items": ["a", "b"]}

    def test_trailing_comma_in_object(self):
        raw = '{"a": 1, "b": 2,}'
        result = _try_repair_json(raw)
        assert result is not None
        assert json.loads(result) == {"a": 1, "b": 2}

    def test_already_valid(self):
        raw = '{"ok": true}'
        result = _try_repair_json(raw)
        assert result is not None
        assert json.loads(result) == {"ok": True}

    def test_unfixable_returns_none(self):
        raw = '{{{totally broken'
        assert _try_repair_json(raw) is None


# ── validate_chapter ──


class TestValidateChapter:
    MINIMAL = {
        "chapter_id": "ch01",
        "title": "第1章",
    }

    def test_minimal_valid(self):
        result = validate_chapter(dict(self.MINIMAL), "ch01")
        assert result["chapter_id"] == "ch01"

    def test_injects_missing_chapter_id(self):
        data = {"title": "第1章"}
        result = validate_chapter(data, "ch99")
        assert result["chapter_id"] == "ch99"

    def test_coerces_string_mermaid_diagrams(self):
        data = {
            **self.MINIMAL,
            "mermaid_diagrams": ["graph TD; A-->B", "sequence diagram"],
        }
        result = validate_chapter(data, "ch01")
        for item in result["mermaid_diagrams"]:
            assert isinstance(item, dict)
            assert "title" in item

    def test_coerces_string_code_snippets(self):
        data = {
            **self.MINIMAL,
            "code_snippets": ["console.log('hi')"],
        }
        result = validate_chapter(data, "ch01")
        for item in result["code_snippets"]:
            assert isinstance(item, dict)
            assert "title" in item

    def test_leaves_valid_objects_alone(self):
        data = {
            **self.MINIMAL,
            "mermaid_diagrams": [
                {"title": "Arch", "chart": "graph TD;", "description": "desc"},
            ],
        }
        result = validate_chapter(data, "ch01")
        assert result["mermaid_diagrams"][0]["chart"] == "graph TD;"

    def test_rejects_missing_title(self):
        with pytest.raises(Exception):
            validate_chapter({"chapter_id": "ch01"}, "ch01")

"""Tests for pyharness.config — YAML project config loading."""

import tempfile
from pathlib import Path

import pytest

from pyharness.config import ProjectConfig, load_project_config


class TestProjectConfig:
    @pytest.fixture
    def real_config(self):
        p = Path("projects/pydantic-ai.yaml")
        if not p.exists():
            pytest.skip("No pydantic-ai.yaml available")
        return p

    def test_load_real_config(self, real_config):
        config = load_project_config(real_config)
        assert config.name == "Pydantic AI"
        assert config.language == "Python"
        assert config.total_chapters == 18
        assert config.book_title == "深入理解 Pydantic AI"

    def test_get_chapter(self, real_config):
        config = load_project_config(real_config)
        ch = config.get_chapter("ch01-what-is-pydantic-ai")
        assert ch is not None
        assert "Pydantic AI" in ch.title

    def test_get_nonexistent_chapter(self, real_config):
        config = load_project_config(real_config)
        assert config.get_chapter("nonexistent") is None

    def test_get_all_chapter_ids(self, real_config):
        config = load_project_config(real_config)
        ids = config.get_all_chapter_ids()
        assert len(ids) == 18
        assert ids[0].startswith("ch01")

    def test_minimal_config(self, tmp_path):
        yaml_content = """
name: "Test Project"
repo_path: "/tmp/test"
target_dir: "src"
language: "Python"
chapters: []
"""
        config_file = tmp_path / "test.yaml"
        config_file.write_text(yaml_content)
        config = load_project_config(config_file)
        assert config.name == "Test Project"
        assert config.total_chapters == 0

    def test_missing_file(self):
        with pytest.raises(FileNotFoundError):
            load_project_config(Path("/nonexistent.yaml"))

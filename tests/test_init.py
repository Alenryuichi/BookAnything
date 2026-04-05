"""Tests for pyharness.init — repo scanning, JSON extraction, YAML generation."""

import json
from pathlib import Path

import pytest

from pyharness.config import load_project_config
from pyharness.init import (
    ScanResult,
    collect_dir_tree,
    collect_stats,
    detect_language,
    detect_source_dir,
    extract_json_from_response,
    generate_yaml,
    infer_project_name,
    scan_repo,
    _generate_fallback_skeleton,
    _safe_name,
    _yaml_str,
)


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    """Create a minimal repo tree for scanning."""
    repo = tmp_path / "my-project"
    src = repo / "src"
    src.mkdir(parents=True)
    (src / "main.ts").write_text("console.log('hi');\n")
    (src / "utils.ts").write_text("export const x = 1;\n")
    (src / "helpers.ts").write_text("export const y = 2;\nexport const z = 3;\n")
    (src / "app.py").write_text("print('hi')\n")
    sub = src / "components"
    sub.mkdir()
    (sub / "Button.tsx").write_text("export const Button = () => {};\n")
    return repo


@pytest.fixture
def node_repo(tmp_path: Path) -> Path:
    """Repo with package.json."""
    repo = tmp_path / "node-project"
    repo.mkdir()
    (repo / "package.json").write_text(json.dumps({"name": "@anthropic/claude-code"}))
    (repo / "src").mkdir()
    (repo / "src" / "index.ts").write_text("export {};\n")
    return repo


@pytest.fixture
def go_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "go-service"
    repo.mkdir()
    (repo / "go.mod").write_text("module github.com/org/go-service\n")
    cmd = repo / "cmd"
    cmd.mkdir()
    (cmd / "main.go").write_text("package main\n")
    return repo


@pytest.fixture
def rust_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "my-crate"
    repo.mkdir()
    (repo / "Cargo.toml").write_text('[package]\nname = "tokio"\nversion = "1.0"\n')
    src = repo / "src"
    src.mkdir()
    (src / "lib.rs").write_text("pub fn hello() {}\n")
    return repo


# ── infer_project_name ────────────────────────────────────────

class TestInferProjectName:
    def test_from_package_json_scoped(self, node_repo: Path):
        assert infer_project_name(node_repo) == "claude-code"

    def test_from_cargo_toml(self, rust_repo: Path):
        assert infer_project_name(rust_repo) == "tokio"

    def test_from_go_mod(self, go_repo: Path):
        assert infer_project_name(go_repo) == "go-service"

    def test_fallback_to_dirname(self, sample_repo: Path):
        assert infer_project_name(sample_repo) == "my-project"

    def test_no_manifest(self, tmp_path: Path):
        bare = tmp_path / "bare-repo"
        bare.mkdir()
        assert infer_project_name(bare) == "bare-repo"


# ── detect_source_dir ─────────────────────────────────────────

class TestDetectSourceDir:
    def test_src_exists(self, sample_repo: Path):
        assert detect_source_dir(sample_repo) == "src"

    def test_no_standard_dirs(self, tmp_path: Path):
        repo = tmp_path / "flat"
        repo.mkdir()
        (repo / "main.py").write_text("")
        assert detect_source_dir(repo) == "."

    def test_priority_order(self, tmp_path: Path):
        repo = tmp_path / "multi"
        repo.mkdir()
        (repo / "lib").mkdir()
        (repo / "app").mkdir()
        assert detect_source_dir(repo) == "lib"


# ── detect_language ───────────────────────────────────────────

class TestDetectLanguage:
    def test_majority_typescript(self, sample_repo: Path):
        assert detect_language(sample_repo / "src") == "TypeScript"

    def test_python_only(self, tmp_path: Path):
        d = tmp_path / "pysrc"
        d.mkdir()
        for i in range(5):
            (d / f"mod{i}.py").write_text("pass\n")
        assert detect_language(d) == "Python"

    def test_empty_dir_defaults(self, tmp_path: Path):
        d = tmp_path / "empty"
        d.mkdir()
        assert detect_language(d) == "TypeScript"

    def test_go_files(self, go_repo: Path):
        assert detect_language(go_repo / "cmd") == "Go"


# ── collect_stats ─────────────────────────────────────────────

class TestCollectStats:
    def test_counts(self, sample_repo: Path):
        files, lines = collect_stats(sample_repo / "src")
        assert files == 5
        assert lines >= 6

    def test_excludes_node_modules(self, tmp_path: Path):
        d = tmp_path / "repo" / "src"
        d.mkdir(parents=True)
        (d / "a.ts").write_text("x\n")
        nm = d / "node_modules"
        nm.mkdir()
        (nm / "b.ts").write_text("y\n")
        files, _ = collect_stats(d)
        assert files == 1


# ── collect_dir_tree ──────────────────────────────────────────

class TestCollectDirTree:
    def test_depth_and_limit(self, sample_repo: Path):
        tree = collect_dir_tree(sample_repo / "src")
        assert "components" in tree
        assert len(tree) <= 80

    def test_excludes_git(self, tmp_path: Path):
        d = tmp_path / "r"
        d.mkdir()
        (d / ".git").mkdir()
        (d / "foo").mkdir()
        tree = collect_dir_tree(d)
        assert ".git" not in tree
        assert "foo" in tree


# ── scan_repo (integration) ───────────────────────────────────

class TestScanRepo:
    def test_full_scan(self, sample_repo: Path):
        result = scan_repo(sample_repo)
        assert result.project_name == "my-project"
        assert result.source_dir == "src"
        assert result.language == "TypeScript"
        assert result.file_count >= 5
        assert result.line_count >= 6
        assert len(result.dir_tree) >= 1


# ── extract_json_from_response ────────────────────────────────

class TestExtractJson:
    def test_clean_json(self):
        obj = {"parts": [{"chapters": []}]}
        assert extract_json_from_response(json.dumps(obj)) == obj

    def test_markdown_wrapped(self):
        text = '```json\n{"parts": []}\n```'
        result = extract_json_from_response(text)
        assert result == {"parts": []}

    def test_think_prefix(self):
        text = '<think>reasoning here</think>{"parts": [{"chapters": []}]}'
        result = extract_json_from_response(text)
        assert result is not None
        assert "parts" in result

    def test_prose_before_json(self):
        text = 'Here is the plan:\n{"parts": []}'
        result = extract_json_from_response(text)
        assert result == {"parts": []}

    def test_invalid_input(self):
        assert extract_json_from_response("no json here") is None

    def test_empty_string(self):
        assert extract_json_from_response("") is None


# ── generate_yaml ─────────────────────────────────────────────

class TestGenerateYaml:
    def _make_scan(self, tmp_path: Path) -> ScanResult:
        return ScanResult(
            project_name="test-project",
            repo_path=tmp_path / "repo",
            source_dir="src",
            language="TypeScript",
            file_count=100,
            line_count=5000,
            dir_tree=["components", "utils"],
            dir_stats=[("components", 30), ("utils", 10)],
        )

    def _make_plan(self) -> dict:
        return {
            "project_name": "Test Project",
            "description": "A test project",
            "parts": [
                {
                    "part_num": 1,
                    "part_title": "Part 1 - 入门",
                    "chapters": [
                        {
                            "id": "ch01-intro",
                            "title": "第1章：入门",
                            "subtitle": "Getting Started",
                            "sources": "src/main.ts",
                            "prerequisites": [],
                            "outline": "- 开篇\n- 核心概念",
                        },
                        {
                            "id": "ch02-core",
                            "title": "第2章：核心",
                            "subtitle": "Core",
                            "sources": "src/core",
                            "prerequisites": ["ch01-intro"],
                            "outline": "- 架构\n- 数据流",
                        },
                    ],
                }
            ],
        }

    def test_round_trip(self, tmp_path: Path):
        scan = self._make_scan(tmp_path)
        plan = self._make_plan()
        path = generate_yaml(scan, plan, tmp_path)
        config = load_project_config(path)
        assert config.name == "Test Project"
        assert config.language == "TypeScript"
        assert len(config.chapters) == 2
        assert config.chapters[0].id == "ch01-intro"
        assert config.chapters[1].prerequisites == ["ch01-intro"]

    def test_part_comments_present(self, tmp_path: Path):
        scan = self._make_scan(tmp_path)
        plan = self._make_plan()
        path = generate_yaml(scan, plan, tmp_path)
        content = path.read_text()
        assert "Part 1 - 入门" in content
        assert "──────" in content

    def test_uses_claude_name(self, tmp_path: Path):
        scan = self._make_scan(tmp_path)
        plan = self._make_plan()
        plan["project_name"] = "My Display Name"
        path = generate_yaml(scan, plan, tmp_path)
        config = load_project_config(path)
        assert config.name == "My Display Name"
        assert "深入理解 My Display Name" in config.book.title


# ── fallback skeleton ─────────────────────────────────────────

class TestFallbackSkeleton:
    def test_generates_valid_yaml(self, sample_repo: Path, tmp_path: Path):
        scan = scan_repo(sample_repo)
        skeleton = _generate_fallback_skeleton(scan)
        path = generate_yaml(scan, skeleton, tmp_path)
        config = load_project_config(path)
        assert config.chapters[0].id == "ch01-introduction"
        assert len(config.chapters) >= 2

    def test_caps_at_12_dirs(self, tmp_path: Path):
        repo = tmp_path / "big"
        src = repo / "src"
        src.mkdir(parents=True)
        for i in range(20):
            d = src / f"dir{i:02d}"
            d.mkdir()
            (d / "file.py").write_text("x\n")
        scan = scan_repo(repo)
        skeleton = _generate_fallback_skeleton(scan)
        chapters = skeleton["parts"][0]["chapters"]
        assert len(chapters) <= 13  # 1 intro + 12 dirs


# ── _safe_name ────────────────────────────────────────────────

class TestSafeName:
    def test_lowercase_and_hyphens(self):
        assert _safe_name("My Awesome Project!") == "my-awesome-project"

    def test_already_safe(self):
        assert _safe_name("claude-code") == "claude-code"

    def test_special_chars(self):
        assert _safe_name("hello@world.2") == "helloworld2"


# ── _yaml_str ────────────────────────────────────────────────

class TestYamlStr:
    def test_plain_string(self):
        assert _yaml_str("hello") == '"hello"'

    def test_escapes_quotes(self):
        assert _yaml_str('say "hi"') == '"say \\"hi\\""'

    def test_escapes_backslash(self):
        assert _yaml_str("a\\b") == '"a\\\\b"'


# ── YAML with special characters ─────────────────────────────

class TestYamlSpecialChars:
    def test_quotes_in_title_round_trip(self, tmp_path: Path):
        """Titles containing double quotes must not break YAML parsing."""
        scan = ScanResult(
            project_name="test",
            repo_path=tmp_path / "repo",
            source_dir="src",
            language="TypeScript",
            file_count=10,
            line_count=500,
            dir_tree=[],
            dir_stats=[],
        )
        plan = {
            "project_name": 'The "Best" Project',
            "description": 'A project with "quotes"',
            "parts": [
                {
                    "part_num": 1,
                    "part_title": "Part 1",
                    "chapters": [
                        {
                            "id": "ch01-intro",
                            "title": '第1章："Hello" World',
                            "subtitle": 'Say "hi"',
                            "sources": "src",
                            "prerequisites": [],
                            "outline": "- intro",
                        }
                    ],
                }
            ],
        }
        path = generate_yaml(scan, plan, tmp_path)
        config = load_project_config(path)
        assert config.name == 'The "Best" Project'
        assert config.chapters[0].title == '第1章："Hello" World'

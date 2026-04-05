"""Project initialization: scan repo → Claude chapter planning → generate YAML.

Replaces the former `new-project.sh` bash script with a pure-Python
implementation that reuses ClaudeClient and ProjectConfig.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pyharness.claude_client import ClaudeClient
from pyharness.config import load_project_config

# ── Constants ──────────────────────────────────────────────────

EXTENSION_MAP: dict[str, str] = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".c": "C/C++",
    ".cpp": "C/C++",
    ".h": "C/C++",
    ".java": "Java",
    ".kt": "Java",
}

SOURCE_EXTENSIONS = set(EXTENSION_MAP.keys()) | {
    ".js", ".jsx", ".swift",
}

EXCLUDE_DIRS = {"node_modules", ".git", "dist", "__pycache__"}

SOURCE_DIR_CANDIDATES = ["src", "lib", "packages", "app", "cmd", "internal"]


# ── Data classes ───────────────────────────────────────────────

@dataclass
class ScanResult:
    project_name: str
    repo_path: Path
    source_dir: str
    language: str
    file_count: int
    line_count: int
    dir_tree: list[str]
    dir_stats: list[tuple[str, int]]


# ── Phase 1: Repo scanning ────────────────────────────────────

def _is_excluded(path: Path, base: Path | None = None) -> bool:
    """Check whether *path* falls under an excluded directory.

    When *base* is given, only path segments relative to *base* are checked,
    avoiding false positives from parent directories that happen to share a
    name with an excluded dir (e.g. ``/var/dist/…``).
    """
    parts = path.relative_to(base).parts if base else path.parts
    return any(part in EXCLUDE_DIRS for part in parts)


def infer_project_name(repo_path: Path) -> str:
    """Infer project name from manifest files, falling back to dirname."""
    pkg = repo_path / "package.json"
    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
            name = data.get("name", "")
            if name:
                return name.split("/")[-1]  # strip @scope/
        except (json.JSONDecodeError, OSError):
            pass

    cargo = repo_path / "Cargo.toml"
    if cargo.exists():
        try:
            for line in cargo.read_text(encoding="utf-8").splitlines():
                if line.startswith("name"):
                    m = re.search(r'"([^"]+)"', line)
                    if m:
                        return m.group(1)
        except OSError:
            pass

    gomod = repo_path / "go.mod"
    if gomod.exists():
        try:
            first_line = gomod.read_text(encoding="utf-8").split("\n", 1)[0]
            parts = first_line.replace("module ", "").strip().split("/")
            if parts:
                return parts[-1]
        except OSError:
            pass

    return repo_path.name


def detect_source_dir(repo_path: Path) -> str:
    for candidate in SOURCE_DIR_CANDIDATES:
        if (repo_path / candidate).is_dir():
            return candidate
    return "."


def detect_language(scan_path: Path) -> str:
    counter: Counter[str] = Counter()
    for path in scan_path.rglob("*"):
        if not path.is_file() or _is_excluded(path, scan_path):
            continue
        lang = EXTENSION_MAP.get(path.suffix.lower())
        if lang:
            counter[lang] += 1
    if not counter:
        return "TypeScript"
    return counter.most_common(1)[0][0]


def collect_stats(scan_path: Path) -> tuple[int, int]:
    """Return (file_count, line_count) for source files."""
    files = 0
    lines = 0
    for path in scan_path.rglob("*"):
        if not path.is_file() or _is_excluded(path, scan_path):
            continue
        files += 1
        if path.suffix.lower() in SOURCE_EXTENSIONS:
            try:
                lines += sum(1 for _ in path.open(encoding="utf-8", errors="ignore"))
            except OSError:
                pass
    return files, lines


def collect_dir_tree(scan_path: Path, max_depth: int = 2, limit: int = 80) -> list[str]:
    """Collect directories up to *max_depth* levels, sorted, capped at *limit*."""
    result: list[str] = []
    base_depth = len(scan_path.parts)
    for path in sorted(scan_path.rglob("*")):
        if not path.is_dir():
            continue
        depth = len(path.parts) - base_depth
        if depth < 1 or depth > max_depth:
            continue
        if _is_excluded(path, scan_path):
            continue
        try:
            rel = str(path.relative_to(scan_path))
        except ValueError:
            continue
        result.append(rel)
        if len(result) >= limit:
            break
    return result


def _collect_dir_stats(scan_path: Path) -> list[tuple[str, int]]:
    """Per top-level subdirectory file counts."""
    stats: list[tuple[str, int]] = []
    try:
        children = sorted(
            p for p in scan_path.iterdir()
            if p.is_dir() and p.name not in EXCLUDE_DIRS
        )
    except OSError:
        return stats
    for child in children:
        count = sum(
            1 for f in child.rglob("*")
            if f.is_file() and not _is_excluded(f, child)
        )
        stats.append((child.name, count))
    return stats


def scan_repo(repo_path: Path) -> ScanResult:
    project_name = infer_project_name(repo_path)
    source_dir = detect_source_dir(repo_path)
    scan_path = repo_path if source_dir == "." else repo_path / source_dir
    language = detect_language(scan_path)
    file_count, line_count = collect_stats(scan_path)
    dir_tree = collect_dir_tree(scan_path)
    dir_stats = _collect_dir_stats(scan_path)
    return ScanResult(
        project_name=project_name,
        repo_path=repo_path,
        source_dir=source_dir,
        language=language,
        file_count=file_count,
        line_count=line_count,
        dir_tree=dir_tree,
        dir_stats=dir_stats,
    )


# ── Phase 2: Chapter planning via Claude ──────────────────────

def build_planning_prompt(scan: ScanResult) -> str:
    dir_stats_text = "\n".join(
        f"  {name}/ ({count} files)" for name, count in scan.dir_stats
    )
    dir_tree_text = "\n".join(scan.dir_tree)

    return f"""\
你是一位技术书籍的资深策划编辑。请为开源项目规划一本深入浅出的技术书。

## 项目信息
- 项目名: {scan.project_name}
- 语言: {scan.language}
- 仓库路径: {scan.repo_path}
- 源码目录: {scan.repo_path}/{scan.source_dir}
- 文件数: {scan.file_count}
- 代码行数: ~{scan.line_count}

## 目录结构
{dir_stats_text}

## 目录树（2 层）
{dir_tree_text}

## 你的任务

1. **先用 Glob/Read/Grep 工具快速探索源码**（重点看入口文件、核心模块、README）
2. 理解项目的架构分层、核心概念、数据流
3. 规划书的章节结构

## 章节规划原则

参考优秀技术书的结构（如《Transformer 架构》分 9 个 Part、32 章）：

1. **按认知递进组织**，不要按目录映射：
   - Part 1: 建立直觉（是什么、为什么、全景图）
   - Part 2-N: 核心概念逐层深入
   - 最后 Part: 总结、进阶、展望

2. **Part 分组**：将相关章节分组为 Part，每个 Part 3-5 章

3. **章节粒度**：
   - 小项目（<1万行）：8-12 章
   - 中项目（1-10万行）：12-20 章
   - 大项目（>10万行）：20-30 章
   - 每章聚焦一个核心概念，不要一章塞太多

4. **每章必须有**：
   - 明确的 sources（对应的源码路径，可以多个逗号分隔）
   - prerequisites（前置章节 id）
   - 5-7 条大纲要点（含开篇场景、核心概念、代码解析、比喻）

5. **id 命名**：ch01-xxx, ch02-yyy...（纯英文 kebab-case）

## 输出要求

直接输出一个 JSON 对象（不要代码块包裹）：

{{
  "project_name": "推断的项目展示名（如 Claude Code, React, Linux Kernel）",
  "description": "项目一句话简介",
  "parts": [
    {{
      "part_num": 1,
      "part_title": "Part 1 - 建立直觉",
      "chapters": [
        {{
          "id": "ch01-what-is-xxx",
          "title": "第1章：XXX 是什么",
          "subtitle": "副标题",
          "sources": "src/main.ts,src/entry",
          "prerequisites": [],
          "outline": "- 开篇：具体场景引入\\n- 核心概念1\\n- 核心概念2\\n- 代码解读\\n- 比喻总结"
        }}
      ]
    }}
  ]
}}"""


def extract_json_from_response(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from Claude's response, handling common noise."""
    raw = text.strip()

    # Strip </think> prefix
    idx = raw.find("</think>")
    if idx >= 0:
        raw = raw[idx + 8:]

    # Strip markdown fences
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()

    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Find outermost { ... }
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        candidate = raw[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    return None


def _generate_fallback_skeleton(scan: ScanResult) -> dict[str, Any]:
    """Generate a minimal chapter plan from directory structure."""
    scan_path = (
        scan.repo_path if scan.source_dir == "." else scan.repo_path / scan.source_dir
    )
    chapters: list[dict[str, Any]] = [
        {
            "id": "ch01-introduction",
            "title": f"第1章：{scan.project_name} 是什么",
            "subtitle": "项目全景概览",
            "sources": scan.source_dir,
            "prerequisites": [],
            "outline": (
                "- 项目定位与解决的问题\n"
                "- 技术栈概览\n"
                "- 架构总览\n"
                "- 本书路线图"
            ),
        }
    ]

    try:
        dirs = sorted(
            p
            for p in scan_path.iterdir()
            if p.is_dir() and p.name not in EXCLUDE_DIRS
        )
    except OSError:
        dirs = []

    for i, d in enumerate(dirs[:12], start=2):
        file_count = sum(1 for f in d.rglob("*") if f.is_file())
        chapters.append(
            {
                "id": f"ch{i:02d}-{d.name}",
                "title": f"第{i}章：{d.name} 模块",
                "subtitle": "TODO: 填写副标题",
                "sources": f"{scan.source_dir}/{d.name}",
                "prerequisites": ["ch01-introduction"],
                "outline": f"- TODO: 填写大纲\n- 该目录包含 {file_count} 个文件",
            }
        )

    return {
        "project_name": scan.project_name,
        "description": "TODO: 填写项目简介",
        "parts": [{"part_num": 1, "part_title": "Part 1", "chapters": chapters}],
    }


async def plan_chapters(repo_path: Path, scan: ScanResult) -> dict[str, Any]:
    """Call Claude to produce a chapter plan; fall back to skeleton on failure."""
    prompt = build_planning_prompt(scan)
    print("  调用 Claude 分析中（可能需要 2-5 分钟）...")

    try:
        timeout = int(os.environ.get("CLAUDE_TIMEOUT", "600"))
        client = ClaudeClient(cwd=repo_path, timeout=timeout)
        result = await client.run(prompt, max_turns=30)
    except Exception as exc:
        print(f"  Claude 调用失败: {exc}")
        print("  回退到基础模式（按目录生成骨架）...")
        return _generate_fallback_skeleton(scan)

    if result is None:
        print("  Claude 返回为空，回退到基础模式...")
        return _generate_fallback_skeleton(scan)

    parsed = extract_json_from_response(str(result))
    if parsed and "parts" in parsed:
        return parsed

    print("  Claude 未能生成有效的章节规划，回退到基础模式...")
    return _generate_fallback_skeleton(scan)


# ── Phase 3: YAML generation ──────────────────────────────────

def _yaml_str(s: str) -> str:
    """Escape a string for safe double-quoted YAML embedding."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _safe_name(name: str) -> str:
    """Lowercase, replace spaces with hyphens, strip non-alphanumeric."""
    return re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-"))


def generate_yaml(scan: ScanResult, plan: dict[str, Any], output_dir: Path) -> Path:
    """Build the YAML string with Part comments and write to output_dir."""
    display_name = plan.get("project_name") or scan.project_name
    description = plan.get("description", "TODO: 填写项目简介")
    safe = _safe_name(scan.project_name)
    output_path = output_dir / f"{safe}.yaml"

    lines: list[str] = []
    lines.append(f"name: {_yaml_str(display_name)}")
    lines.append(f"repo_path: {_yaml_str(str(scan.repo_path))}")
    lines.append(f"target_dir: {_yaml_str(scan.source_dir)}")
    lines.append(f"language: {_yaml_str(scan.language)}")
    lines.append(f"description: {_yaml_str(description)}")
    lines.append("")
    lines.append("book:")
    lines.append(f"  title: {_yaml_str('深入理解 ' + display_name)}")
    lines.append(f"  subtitle: {_yaml_str('一本由浅入深的交互式技术书')}")
    lines.append("  stats:")
    lines.append(f"    files: {scan.file_count}")
    lines.append(f"    lines: {scan.line_count}")
    lines.append("")
    lines.append("chapters:")

    parts = plan.get("parts", [])
    for part in parts:
        part_title = part.get("part_title", "")
        lines.append("")
        lines.append("  # ──────────────────────────────")
        lines.append(f"  # {part_title}")
        lines.append("  # ──────────────────────────────")

        for ch in part.get("chapters", []):
            ch_id = ch.get("id", "")
            ch_title = ch.get("title", "")
            ch_subtitle = ch.get("subtitle", "")
            ch_sources = ch.get("sources", "")
            prereqs = ch.get("prerequisites", [])
            prereq_str = ", ".join(f'"{p}"' for p in prereqs)
            outline = ch.get("outline", "")

            lines.append(f"  - id: {ch_id}")
            lines.append(f"    title: {_yaml_str(ch_title)}")
            lines.append(f"    subtitle: {_yaml_str(ch_subtitle)}")
            lines.append(f"    sources: {_yaml_str(ch_sources)}")
            lines.append(f"    prerequisites: [{prereq_str}]")
            lines.append("    outline: |")
            for ol_line in outline.splitlines():
                if ol_line.strip():
                    lines.append(f"      {ol_line}")

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return output_path


# ── Top-level entry point ─────────────────────────────────────

async def init_project(repo_path: Path) -> Path:
    """Full init pipeline: scan → plan → generate YAML."""
    from pyharness.log import log as hlog

    repo_path = repo_path.resolve()

    hlog("HEAD", "Phase 1: 扫描仓库", progress=5, phase="scan")
    hlog("INFO", f"路径: {repo_path}", progress=5, phase="scan")

    scan = scan_repo(repo_path)
    hlog("INFO", f"项目名: {scan.project_name}", progress=15, phase="scan")
    hlog("INFO", f"源码目录: {scan.source_dir}", progress=20, phase="scan")
    hlog("INFO", f"语言: {scan.language}", progress=25, phase="scan")
    hlog("INFO", f"文件: {scan.file_count}, 代码: ~{scan.line_count} 行", progress=35, phase="scan")
    if scan.dir_stats:
        hlog("INFO", "顶层目录:", progress=38, phase="scan")
        for name, count in scan.dir_stats:
            hlog("INFO", f"  {name}/ ({count} files)")
    hlog("OK", "仓库扫描完成", progress=40, phase="scan")

    hlog("HEAD", "Phase 2: Claude 分析源码，规划章节", progress=42, phase="plan")

    plan = await plan_chapters(repo_path, scan)
    hlog("OK", "章节规划完成", progress=70, phase="plan")

    hlog("HEAD", "Phase 3: 生成 project.yaml", progress=72, phase="yaml")

    output_dir = Path(__file__).resolve().parent.parent / "projects"
    output_path = generate_yaml(scan, plan, output_dir)

    try:
        config = load_project_config(output_path)
        ch_count = len(config.chapters)
    except Exception as exc:
        hlog("WARN", f"生成的 YAML 无法加载: {exc}")
        ch_count = "?"

    hlog("OK", f"YAML 已写入: {output_path}", progress=90, phase="yaml")

    part_count = len(plan.get("parts", []))
    display_name = plan.get("project_name", scan.project_name)

    hlog("HEAD", "初始化完成", progress=100, phase="done")
    hlog("OK", f"项目: {display_name} ({scan.language})")
    hlog("INFO", f"统计: {scan.file_count} 文件, ~{scan.line_count} 行代码")
    hlog("INFO", f"结构: {part_count} 个 Part, {ch_count} 个章节")
    hlog("INFO", f"下一步: python3 -m pyharness run --project {output_path}")

    return output_path

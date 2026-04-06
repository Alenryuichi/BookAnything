"""Phase: Analyze — deep code analysis to build a knowledge graph."""

from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pathspec

from pyharness.claude_client import ClaudeClient
from pyharness.log import log, log_event
from pyharness.schemas import (
    ArchLayer,
    BatchResult,
    FileEntry,
    GraphEdge,
    GraphNode,
    GraphNodeChild,
    GlobalConcept,
    GlobalDiscoveryResult,
    GuidedTour,
    KnowledgeGraph,
    KnowledgeGraphStats,
    StaticGraph,
    TourStep,
)

if TYPE_CHECKING:
    from pyharness.runner import HarnessRunner

# ── Constants ──

SKIP_DIRS = frozenset({
    ".git", "node_modules", "__pycache__", "vendor", "dist", "build",
    ".next", ".cache", "coverage", ".tox", "venv", ".venv", "env",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".eggs", "egg-info",
    ".idea", ".vscode", ".DS_Store", "target", "out", ".turbo",
})

SKIP_EXTENSIONS = frozenset({
    ".pyc", ".pyo", ".class", ".o", ".so", ".dylib", ".dll", ".exe",
    ".bin", ".dat", ".db", ".sqlite", ".sqlite3",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".bmp", ".webp",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".wasm", ".map", ".min.js", ".min.css",
})

SKIP_FILENAMES = frozenset({
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Cargo.lock", "Gemfile.lock", "composer.lock",
    "shrinkwrap.json",
})

MAX_FILE_SIZE = 50 * 1024  # 50KB

LANG_MAP = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin",
    ".rb": "ruby", ".php": "php", ".cs": "csharp", ".cpp": "cpp",
    ".c": "c", ".h": "c", ".hpp": "cpp", ".swift": "swift",
    ".scala": "scala", ".r": "r", ".R": "r",
    ".sql": "sql", ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".json": "json", ".md": "markdown", ".html": "html", ".css": "css",
    ".scss": "scss", ".less": "less", ".vue": "vue", ".svelte": "svelte",
    ".proto": "protobuf", ".graphql": "graphql", ".gql": "graphql",
    ".tf": "terraform", ".hcl": "hcl",
    ".lua": "lua", ".ex": "elixir", ".exs": "elixir",
    ".zig": "zig", ".nim": "nim", ".dart": "dart",
    ".ml": "ocaml", ".mli": "ocaml", ".hs": "haskell",
}

DEFAULT_LAYERS = [
    ArchLayer(id="api", name="API Layer", color="#3b82f6"),
    ArchLayer(id="service", name="Service Layer", color="#8b5cf6"),
    ArchLayer(id="data", name="Data Layer", color="#10b981"),
    ArchLayer(id="ui", name="UI Layer", color="#f59e0b"),
    ArchLayer(id="infra", name="Infrastructure", color="#6b7280"),
    ArchLayer(id="util", name="Utilities", color="#ec4899"),
]

LARGE_FILE_THRESHOLD = 500  # lines


# ── Step 1: File Tree Scanner ──

def _load_gitignore(repo_path: Path) -> pathspec.PathSpec | None:
    gi = repo_path / ".gitignore"
    if gi.is_file():
        return pathspec.PathSpec.from_lines("gitwildmatch", gi.read_text().splitlines())
    return None


def _detect_language(path: Path) -> str:
    suffix = path.suffix.lower()
    return LANG_MAP.get(suffix, "")


def _count_lines(filepath: Path) -> int:
    try:
        return sum(1 for _ in filepath.open("rb"))
    except Exception:
        return 0


def scan_file_tree(repo_path: Path) -> list[FileEntry]:
    """Walk the repository and return a filtered list of source files."""
    gitignore = _load_gitignore(repo_path)
    entries: list[FileEntry] = []

    for root, dirs, files in os.walk(repo_path):
        root_path = Path(root)
        rel_root = root_path.relative_to(repo_path)

        dirs[:] = [
            d for d in dirs
            if d not in SKIP_DIRS
            and not d.startswith(".")
        ]

        for fname in files:
            fpath = root_path / fname
            rel = fpath.relative_to(repo_path)

            if fname in SKIP_FILENAMES:
                continue
            if fpath.suffix.lower() in SKIP_EXTENSIONS:
                continue
            if fname.startswith("."):
                continue

            try:
                size = fpath.stat().st_size
            except OSError:
                continue
            if size > MAX_FILE_SIZE or size == 0:
                continue

            if gitignore and gitignore.match_file(str(rel)):
                continue

            lang = _detect_language(fpath)
            if not lang:
                continue

            line_count = _count_lines(fpath)
            entries.append(FileEntry(
                path=str(rel),
                language=lang,
                line_count=line_count,
                size_bytes=size,
            ))

    entries.sort(key=lambda e: e.path)
    return entries


# ── Step 2: Batch Analyzer ──


async def _run_global_discovery(client: ClaudeClient, files: list[FileEntry], repo_name: str) -> list[GlobalConcept]:
    """Phase 1: Global Discovery - Extract abstract concepts from the file tree."""
    from pyharness.log import log
    log("STEP", "Step 1.5/5: Global Discovery (Semantic Concepts)...")

    # Condense the file list to save tokens
    tree_lines = []
    for f in files[:200]: # max 200 files for context
        tree_lines.append(f.path)
    
    prompt = f"""You are analyzing the repository "{repo_name}".
Based on the following list of files, identify the high-level semantic concepts of this system.

Output a JSON object containing a "concepts" array. Each concept must have:
- "id": string (e.g. "concept-auth", "workflow-checkout")
- "type": one of "Concept", "Workflow", "DataModel", "Component"
- "name": display name
- "summary": 1-2 sentence description
- "layer": one of "api", "service", "data", "ui", "infra", "util"

Files:
{chr(10).join(tree_lines)}
"""
    try:
        result = await client.run(prompt, max_turns=15, response_model=GlobalDiscoveryResult)
        if isinstance(result, GlobalDiscoveryResult):
            log("OK", f"Discovered {len(result.concepts)} global concepts.")
            return result.concepts
    except Exception as exc:
        log("WARN", f"Global discovery failed: {exc}")
    
    return []


def _create_batches(files: list[FileEntry], max_lines: int = 3000) -> list[list[FileEntry]]:
    """Group files into batches respecting line count limits."""
    files_sorted = sorted(files, key=lambda f: f.path)
    batches: list[list[FileEntry]] = []
    current: list[FileEntry] = []
    current_lines = 0

    for f in files_sorted:
        if f.line_count > LARGE_FILE_THRESHOLD:
            if current:
                batches.append(current)
                current = []
                current_lines = 0
            batches.append([f])
            continue

        if current_lines + f.line_count > max_lines and current:
            batches.append(current)
            current = []
            current_lines = 0

        current.append(f)
        current_lines += f.line_count

    if current:
        batches.append(current)
    return batches


def _build_static_file_summary(entry: FileEntry, static_graph: StaticGraph) -> str | None:
    """Render a compact structural summary for a file from the static graph."""
    file_nodes = [n for n in static_graph.nodes if n.file_path == entry.path]
    if not file_nodes:
        return None

    node_map = {node.id: node for node in file_nodes}
    top_level_ids = {
        edge.target
        for edge in static_graph.edges
        if edge.type == "static_contains" and edge.source == entry.path
    }
    imports = sorted({
        edge.target
        for edge in static_graph.edges
        if edge.type == "static_import" and edge.source == entry.path
    })
    inherits = [
        f"{node_map[edge.source].name} -> {edge.target}"
        for edge in static_graph.edges
        if edge.type == "static_inherits" and edge.source in node_map
    ]
    calls = [
        f"{edge.source} -> {edge.target}"
        for edge in static_graph.edges
        if edge.type == "static_call" and edge.source in node_map
    ]

    declarations: list[str] = []
    top_level_nodes = [
        node_map[node_id]
        for node_id in top_level_ids
        if node_id in node_map
    ]
    top_level_nodes.sort(key=lambda node: (node.line_start, node.name))
    for node in top_level_nodes:
        details = [f"{node.type} {node.name}"]
        if node.signature:
            details.append(f"signature={node.signature}")
        if node.line_start or node.line_end:
            details.append(f"lines={node.line_start}-{node.line_end}")
        if node.type == "class":
            methods = sorted(
                child.name
                for child in file_nodes
                if child.parent_id == node.id and child.type == "method"
            )
            if methods:
                details.append(f"methods={', '.join(methods)}")
        declarations.append("; ".join(details))

    has_usable_coverage = bool(imports or inherits or calls or declarations)
    if not has_usable_coverage:
        return None

    lines = [
        "STATIC SUMMARY (authoritative structural context):",
        f"- Imports: {', '.join(imports) if imports else '(none)'}",
        f"- Declarations: {' | '.join(declarations) if declarations else '(none)'}",
        f"- Inheritance: {' | '.join(inherits) if inherits else '(none)'}",
        f"- Calls: {' | '.join(calls) if calls else '(none)'}",
        "- Raw source omitted because deterministic static-graph coverage exists for this file.",
    ]
    return "\n".join(lines)


def _build_batch_prompt(
    batch: list[FileEntry],
    repo_path: Path,
    repo_name: str,
    concepts: list[GlobalConcept] = [],
    static_graph: StaticGraph | None = None,
) -> str:
    """Build the Claude prompt for analyzing a batch of files."""
    file_sections = []
    for entry in batch:
        static_summary = None
        if static_graph is not None:
            static_summary = _build_static_file_summary(entry, static_graph)

        if static_summary is not None:
            file_body = static_summary
        else:
            fpath = repo_path / entry.path
            try:
                content = fpath.read_text(errors="replace")
            except Exception:
                content = "(could not read file)"
            file_body = f"RAW SOURCE FALLBACK:\n{content}"

        file_sections.append(
            f"--- FILE: {entry.path} ({entry.language}, {entry.line_count} lines) ---\n{file_body}\n--- END ---"
        )

    files_text = "\n\n".join(file_sections)

    concepts_text = "\n".join(f"- [{c.type}] {c.id}: {c.name}" for c in concepts) if concepts else "(No global concepts provided)"

    return f"""You are analyzing source code from the repository "{repo_name}".
Extract the code structure AND semantic relationships for a semantic knowledge graph.

Global Concepts already discovered in this repository:
{concepts_text}

Each file block below is either:
- a STATIC SUMMARY produced by deterministic tree-sitter analysis, or
- a RAW SOURCE FALLBACK when static coverage is unavailable.

When a STATIC SUMMARY is present, you MUST treat it as the authoritative structural source for imports,
declarations, inheritance, and calls. Use it to populate the file's "imports" and "children" fields, and
focus your reasoning on semantic summaries and graph edges instead of reconstructing syntax from raw code.

For EACH file below, output a JSON object with:
- "id": the file path exactly as given
- "type": "file"
- "name": a short display name (last 2 path segments, e.g. "auth/service.ts")
- "layer": one of "api", "service", "data", "ui", "infra", "util"
- "summary": 1-2 sentence plain English description of what this file does
- "language": the programming language
- "line_count": number of lines
- "imports": array of {{ "from": "module/path", "names": ["Name1", "Name2"] }}
- "edges": semantic edges connecting this file or its children to global concepts or other entities. Array of {{ "source": "file_id or child_id", "target": "concept_id or other_id", "type": "IMPLEMENTS" | "MUTATES" | "TRIGGERS" | "DEPENDS_ON", "label": "optional description" }}
- "children": array of classes and top-level functions found in this file:
  - "id": "<filepath>::<ClassName>" or "<filepath>::<function_name>"
  - "type": "class" or "function"
  - "name": the class or function name
  - "summary": 1 sentence description
  - "signature": the full signature line
  - "line_start": approximate starting line number
  - "line_end": approximate ending line number
  - "children": for classes only — their methods, same shape with type="method"

Output ONLY a JSON object: {{ "files": [...] }}
Do NOT include any text outside the JSON.

{files_text}"""


async def _analyze_batch(
    client: ClaudeClient,
    batch: list[FileEntry],
    repo_path: Path,
    repo_name: str,
    batch_idx: int,
    total_batches: int,
    concepts: list[GlobalConcept] = [],
    static_graph: StaticGraph | None = None,
) -> BatchResult:
    """Send a batch of files to Claude for analysis, with retries."""
    prompt = _build_batch_prompt(batch, repo_path, repo_name, concepts, static_graph)
    file_names = [e.path for e in batch]

    for attempt in range(3):
        try:
            result = await client.run(
                prompt,
                max_turns=30,
                response_model=BatchResult,
            )
            if isinstance(result, BatchResult):
                log("OK", f"Batch {batch_idx+1}/{total_batches}: analyzed {len(result.files)} files")
                return result
        except Exception as exc:
            log("WARN", f"Batch {batch_idx+1}/{total_batches} attempt {attempt+1}/3 failed: {exc}")
            if attempt < 2:
                await asyncio.sleep(5 * (attempt + 1))

    log("ERROR", f"Batch {batch_idx+1}/{total_batches} failed all attempts, skipping {file_names}")
    return BatchResult(files=[])


async def _run_batch_analysis(
    runner: "HarnessRunner",
    files: list[FileEntry],
    repo_path: Path,
    concepts: list[GlobalConcept] = [],
    static_graph: StaticGraph | None = None,
) -> list[BatchResult]:
    """Run all batches in parallel with bounded concurrency."""
    batches = _create_batches(files)
    total = len(batches)
    log("INFO", f"Created {total} analysis batches from {len(files)} files")
    log_event("analyze_batches_created", {"total_batches": total, "total_files": len(files)})

    client = ClaudeClient(cwd=repo_path, timeout=900, max_retries=0)
    semaphore = asyncio.Semaphore(runner.max_parallel)

    async def bounded(idx: int, batch: list[FileEntry]) -> BatchResult:
        async with semaphore:
            log_event("analyze_batch_start", {
                "batch": idx + 1, "total_batches": total,
                "files": [e.path for e in batch],
            })
            result = await _analyze_batch(
                client, batch, repo_path, runner.config.name,
                idx, total, concepts, static_graph
            )
            log_event("analyze_batch_complete", {
                "batch": idx + 1,
                "nodes_extracted": len(result.files),
            })
            return result

    tasks = [bounded(i, b) for i, b in enumerate(batches)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: list[BatchResult] = []
    for r in results:
        if isinstance(r, BatchResult):
            out.append(r)
        elif isinstance(r, Exception):
            log("ERROR", f"Batch analysis exception: {r}")
    return out


# ── Step 3: Merge & Resolve ──

def _parse_children(raw_children: list[dict[str, Any]], file_id: str) -> list[GraphNodeChild]:
    """Convert raw dict children to GraphNodeChild models."""
    result = []
    for c in raw_children:
        child_id = c.get("id", f"{file_id}::{c.get('name', 'unknown')}")
        child_type = c.get("type", "function")
        if child_type not in ("class", "function", "method", "constant"):
            child_type = "function"

        sub_children = []
        if child_type == "class" and "children" in c:
            sub_children = _parse_children(c["children"], file_id)

        result.append(GraphNodeChild(
            id=child_id,
            type=child_type,
            name=c.get("name", ""),
            summary=c.get("summary", ""),
            signature=c.get("signature", ""),
            line_start=c.get("line_start", 0),
            line_end=c.get("line_end", 0),
            children=sub_children,
        ))
    return result


def _merge_batches(batches: list[BatchResult], files: list[FileEntry], global_concepts: list[GlobalConcept] = []) -> KnowledgeGraph:
    """Merge batch results into a single KnowledgeGraph."""
    node_map: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    edge_set: set[tuple[str, str, str]] = set()
    
    # Add global concepts to nodes
    for c in global_concepts:
        node_map[c.id] = GraphNode(
            id=c.id,
            type=c.type,
            name=c.name,
            layer=c.layer,
            summary=c.summary,
        )

    file_set = {f.path for f in files}

    for batch in batches:
        for fr in batch.files:
            if fr.id in node_map:
                continue

            layer = fr.layer if fr.layer in ("api", "service", "data", "ui", "infra", "util") else "util"
            children = _parse_children(fr.children, fr.id)

            node = GraphNode(
                id=fr.id,
                type="file",
                name=fr.name or fr.id.rsplit("/", 1)[-1],
                layer=layer,
                summary=fr.summary,
                language=fr.language,
                line_count=fr.line_count,
                imports=fr.imports,
                children=children,
            )
            node_map[fr.id] = node

            for imp in fr.imports:
                target = _resolve_import(fr.id, imp.get("from", ""), file_set)
                if target and target != fr.id:
                    key = (fr.id, target, "import")
                    if key not in edge_set:
                        edge_set.add(key)
                        names = imp.get("names", [])
                        label_names = ", ".join(names[:3])
                        if len(names) > 3:
                            label_names += f" +{len(names)-3}"
                        edges.append(GraphEdge(
                            source=fr.id,
                            target=target,
                            type="import",
                            label=f"imports {label_names}" if label_names else "imports",
                        ))
            
            # Add semantic edges
            for edge in getattr(fr, "edges", []):
                source = edge.get("source")
                target = edge.get("target")
                edge_type = edge.get("type", "DEPENDS_ON")
                if source and target:
                    key = (source, target, edge_type)
                    if key not in edge_set:
                        edge_set.add(key)
                        edges.append(GraphEdge(
                            source=source,
                            target=target,
                            type=edge_type,
                            label=edge.get("label", ""),
                        ))

    total_funcs = 0
    total_classes = 0
    for node in node_map.values():
        for child in node.children:
            if child.type == "class":
                total_classes += 1
                total_funcs += len(child.children)
            elif child.type == "function":
                total_funcs += 1

    graph = KnowledgeGraph(
        version="1.0",
        generated_at=datetime.now(timezone.utc).isoformat(),
        stats=KnowledgeGraphStats(
            total_files=len(node_map),
            total_functions=total_funcs,
            total_classes=total_classes,
            total_edges=len(edges),
        ),
        layers=DEFAULT_LAYERS,
        nodes=list(node_map.values()),
        edges=edges,
    )
    return graph


def _resolve_import(source_file: str, import_path: str, file_set: set[str]) -> str | None:
    """Resolve an import path to an actual file in the repo."""
    if not import_path:
        return None

    cleaned = import_path.strip().strip("'\"")

    if cleaned in file_set:
        return cleaned

    for ext in (".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"):
        candidate = cleaned + ext
        if candidate in file_set:
            return candidate

    for index in ("index.ts", "index.tsx", "index.js", "__init__.py", "mod.rs"):
        candidate = cleaned.rstrip("/") + "/" + index
        if candidate in file_set:
            return candidate

    if cleaned.startswith("./") or cleaned.startswith("../"):
        source_dir = source_file.rsplit("/", 1)[0] if "/" in source_file else ""
        parts = source_dir.split("/") if source_dir else []
        for seg in cleaned.split("/"):
            if seg == ".":
                continue
            elif seg == "..":
                if parts:
                    parts.pop()
            else:
                parts.append(seg)
        resolved = "/".join(parts)
        if resolved in file_set:
            return resolved
        for ext in (".ts", ".tsx", ".js", ".jsx", ".py"):
            if resolved + ext in file_set:
                return resolved + ext

    return None


# ── Step 4: Tour Generation ──

async def _generate_tours(
    client: ClaudeClient,
    graph: KnowledgeGraph,
) -> list[GuidedTour]:
    """Generate guided tours from the graph structure."""
    node_summaries = []
    for n in graph.nodes[:100]:
        node_summaries.append(f"- {n.id} [{n.layer}]: {n.summary}")

    edge_summaries = []
    for e in graph.edges[:200]:
        edge_summaries.append(f"  {e.source} → {e.target} ({e.type})")

    condensed = f"""Files ({graph.stats.total_files}):
{chr(10).join(node_summaries)}

Dependencies ({graph.stats.total_edges}):
{chr(10).join(edge_summaries)}"""

    prompt = f"""Based on this codebase structure, create 2-3 guided tours for someone new to this project.

Each tour should:
1. Have a clear theme (e.g. "Request Lifecycle", "Core Business Logic", "Data Pipeline")
2. Order nodes so prerequisites come first
3. Include a 2-3 sentence narrative per step explaining what to notice
4. Use only node IDs that appear in the file list below

Codebase structure:
{condensed}

Output ONLY a JSON object: {{ "tours": [{{ "id": "...", "name": "...", "description": "...", "steps": [{{ "node_id": "...", "narrative": "..." }}] }}] }}
Do NOT include any text outside the JSON."""

    try:
        raw = await client.run(prompt, max_turns=15)
        if not raw or not isinstance(raw, str):
            return []

        cleaned = ClaudeClient._extract_json(raw)
        if not cleaned:
            return []

        data = json.loads(cleaned)
        tours_data = data.get("tours", [])

        valid_ids = {n.id for n in graph.nodes}
        tours = []
        for td in tours_data:
            steps = []
            for s in td.get("steps", []):
                if s.get("node_id") in valid_ids:
                    steps.append(TourStep(
                        node_id=s["node_id"],
                        narrative=s.get("narrative", ""),
                    ))
            if steps:
                tours.append(GuidedTour(
                    id=td.get("id", f"tour-{len(tours)+1}"),
                    name=td.get("name", "Tour"),
                    description=td.get("description", ""),
                    steps=steps,
                ))
        return tours
    except Exception as exc:
        log("WARN", f"Tour generation failed: {exc}")
        return []


# ── Step 5: Chapter Link Resolution ──

def _resolve_chapter_links(
    graph: KnowledgeGraph,
    chapters_dir: Path,
) -> dict[str, list[str]]:
    """Match graph nodes to existing chapters."""
    links: dict[str, list[str]] = {}

    if not chapters_dir.is_dir():
        return links

    node_ids = {n.id for n in graph.nodes}
    node_names = {}
    for n in graph.nodes:
        base = n.id.rsplit("/", 1)[-1] if "/" in n.id else n.id
        node_names[base] = n.id
        stem = base.rsplit(".", 1)[0] if "." in base else base
        node_names[stem] = n.id

    for chapter_file in chapters_dir.glob("*.json"):
        try:
            data = json.loads(chapter_file.read_text())
        except Exception:
            continue

        chapter_id = data.get("chapter_id", chapter_file.stem)
        referenced_nodes: set[str] = set()

        for snippet in data.get("code_snippets", []):
            source = snippet.get("source", "")
            if source:
                if source in node_ids:
                    referenced_nodes.add(source)
                elif source in node_names:
                    referenced_nodes.add(node_names[source])

        for section in data.get("sections", []):
            content = section.get("content", "")
            for nid in node_ids:
                fname = nid.rsplit("/", 1)[-1] if "/" in nid else nid
                if fname in content:
                    referenced_nodes.add(nid)

        for nid in referenced_nodes:
            links.setdefault(nid, [])
            if chapter_id not in links[nid]:
                links[nid].append(chapter_id)

    return links


# ── Main Entry Point ──

async def step_analyze(
    runner: "HarnessRunner",
    force: bool = False,
    static_graph: StaticGraph | None = None,
) -> None:
    """Analyze the target repository and generate a knowledge graph."""
    kg_path = runner.knowledge_dir / "knowledge-graph.json"

    if kg_path.exists() and not force:
        log("INFO", "Knowledge graph already exists, skipping analysis (use --reanalyze to force)")
        return

    from pyharness.repo import resolve_repo_path, RepoNotFoundError
    try:
        repo_path = runner.resolved_repo_path or resolve_repo_path(
            runner.config.repo_path,
            remote_url=runner.config.remote_url,
            base_dir=runner.harness_dir,
        )
    except RepoNotFoundError as e:
        log("ERROR", str(e))
        return

    log("HEAD", f"Analyzing repository: {repo_path}")
    log_event("analyze_start", {"repo": str(repo_path)})

    # Step 1: Scan
    log("STEP", "Step 1/5: Scanning file tree...")
    files = scan_file_tree(repo_path)
    total_lines = sum(f.line_count for f in files)
    log("OK", f"Found {len(files)} source files ({total_lines:,} lines)")
    log_event("analyze_scan_complete", {
        "files_found": len(files),
        "total_lines": total_lines,
    })

    if not files:
        log("WARN", "No source files found, writing empty graph")
        empty = KnowledgeGraph(
            repo=str(repo_path),
            generated_at=datetime.now(timezone.utc).isoformat(),
            layers=DEFAULT_LAYERS,
        )
        kg_path.parent.mkdir(parents=True, exist_ok=True)
        kg_path.write_text(json.dumps(empty.model_dump(), indent=2, ensure_ascii=False))
        log_event("analyze_complete", {"output_path": str(kg_path), "stats": empty.stats.model_dump()})
        return

    # Step 1.5: Global Discovery
    client = ClaudeClient(cwd=repo_path, timeout=600, max_retries=1)
    global_concepts = await _run_global_discovery(client, files, runner.config.name)

    # Step 2: Semantic Mapping (Batch analysis)
    log("STEP", "Step 2/5: Deep semantic code mapping (Claude CLI)...")
    batches = await _run_batch_analysis(runner, files, repo_path, global_concepts, static_graph)

    # Step 3: Consolidation (Merge)
    log("STEP", "Step 3/5: Merging and consolidating semantic graph...")
    graph = _merge_batches(batches, files, global_concepts)
    graph.repo = str(repo_path)
    log("OK", f"Graph: {graph.stats.total_files} files, {graph.stats.total_classes} classes, "
        f"{graph.stats.total_functions} functions, {graph.stats.total_edges} edges")
    log_event("analyze_merge_complete", {
        "total_nodes": graph.stats.total_files,
        "total_edges": graph.stats.total_edges,
    })

    # Step 4: Tours
    log("STEP", "Step 4/5: Generating guided tours...")
    tour_client = ClaudeClient(cwd=repo_path, timeout=600, max_retries=1)
    tours = await _generate_tours(tour_client, graph)
    graph.tours = tours
    log("OK", f"Generated {len(tours)} guided tours")
    log_event("analyze_tours_complete", {"tours": len(tours)})

    # Step 5: Chapter links
    log("STEP", "Step 5/5: Resolving chapter links...")
    chapter_links = _resolve_chapter_links(graph, runner.chapters_dir)
    graph.chapter_links = chapter_links
    log("OK", f"Linked {len(chapter_links)} nodes to chapters")

    # Write output
    kg_path.parent.mkdir(parents=True, exist_ok=True)
    kg_path.write_text(json.dumps(graph.model_dump(), indent=2, ensure_ascii=False))
    log("OK", f"Knowledge graph written to {kg_path}")
    log_event("analyze_complete", {
        "output_path": str(kg_path),
        "stats": graph.stats.model_dump(),
    })

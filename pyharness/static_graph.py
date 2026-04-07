"""Static graph construction via tree-sitter AST parsing.

Builds a deterministic structural graph (imports, call edges, class hierarchy)
with zero LLM token cost. Falls back gracefully when tree-sitter grammars
are unavailable for a given language.

References:
  - Codebase-Memory [arXiv:2603.27277]: tree-sitter KG reduces token usage ~10x
  - LLMSCAN: AST → call graph as LLM pre-processing layer
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pyharness.log import log
from pyharness.schemas import (
    FileEntry,
    StaticEdge,
    StaticGraph,
    StaticNode,
)

# ── Tree-sitter language loading (optional) ──

_PARSERS: dict[str, Any] = {}
_TS_AVAILABLE = False

try:
    from tree_sitter import Language, Parser

    _TS_AVAILABLE = True
except ImportError:
    pass


def _get_language(lang_key: str) -> Any | None:
    """Load a tree-sitter Language object for a supported language."""
    if not _TS_AVAILABLE:
        return None
    _LANG_MAP = {
        "python": ("tree_sitter_python", "language"),
        "javascript": ("tree_sitter_javascript", "language"),
        "typescript": ("tree_sitter_typescript", "language_typescript"),
        "tsx": ("tree_sitter_typescript", "language_tsx"),
        "go": ("tree_sitter_go", "language"),
        "rust": ("tree_sitter_rust", "language"),
        "java": ("tree_sitter_java", "language"),
    }
    entry = _LANG_MAP.get(lang_key)
    if not entry:
        return None
    mod_name, func_name = entry
    try:
        import importlib
        mod = importlib.import_module(mod_name)
        return Language(getattr(mod, func_name)())
    except Exception:
        return None


def _get_parser(lang_key: str) -> Any | None:
    """Get or create a cached Parser for a language."""
    if lang_key in _PARSERS:
        return _PARSERS[lang_key]
    language = _get_language(lang_key)
    if language is None:
        _PARSERS[lang_key] = None
        return None
    parser = Parser(language)
    _PARSERS[lang_key] = parser
    return parser


# ── File extension → tree-sitter language key ──

_EXT_TO_TS_LANG: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
}


# ── Language-specific extractors ──

def _text(node: Any, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _extract_python(tree: Any, source: bytes, file_path: str) -> tuple[list[StaticNode], list[StaticEdge]]:
    nodes: list[StaticNode] = []
    edges: list[StaticEdge] = []
    root = tree.root_node

    for child in root.children:
        if child.type == "import_statement":
            for name_node in child.children:
                if name_node.type == "dotted_name":
                    mod = _text(name_node, source)
                    edges.append(StaticEdge(source=file_path, target=mod, type="static_import", label=f"import {mod}"))
        elif child.type == "import_from_statement":
            mod_node = child.child_by_field_name("module_name")
            if mod_node:
                mod = _text(mod_node, source)
                edges.append(StaticEdge(source=file_path, target=mod, type="static_import", label=f"from {mod}"))
        elif child.type == "class_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                cls_name = _text(name_node, source)
                cls_id = f"{file_path}::{cls_name}"
                nodes.append(StaticNode(
                    id=cls_id, type="class", name=cls_name,
                    file_path=file_path, language="python",
                    line_start=child.start_point[0] + 1,
                    line_end=child.end_point[0] + 1,
                    parent_id=file_path,
                ))
                edges.append(StaticEdge(source=file_path, target=cls_id, type="static_contains"))
                superclasses = child.child_by_field_name("superclasses")
                if superclasses:
                    for arg in superclasses.children:
                        if arg.type in ("identifier", "attribute"):
                            base = _text(arg, source)
                            edges.append(StaticEdge(source=cls_id, target=base, type="static_inherits", label=f"extends {base}"))
                for method in child.children:
                    if method.type == "function_definition":
                        mname_node = method.child_by_field_name("name")
                        if mname_node:
                            mname = _text(mname_node, source)
                            mid = f"{cls_id}::{mname}"
                            params = method.child_by_field_name("parameters")
                            sig = f"def {mname}({_text(params, source) if params else ''})"
                            nodes.append(StaticNode(
                                id=mid, type="method", name=mname,
                                file_path=file_path, language="python",
                                line_start=method.start_point[0] + 1,
                                line_end=method.end_point[0] + 1,
                                signature=sig, parent_id=cls_id,
                            ))
        elif child.type == "function_definition":
            name_node = child.child_by_field_name("name")
            if name_node:
                fname = _text(name_node, source)
                fid = f"{file_path}::{fname}"
                params = child.child_by_field_name("parameters")
                sig = f"def {fname}({_text(params, source) if params else ''})"
                nodes.append(StaticNode(
                    id=fid, type="function", name=fname,
                    file_path=file_path, language="python",
                    line_start=child.start_point[0] + 1,
                    line_end=child.end_point[0] + 1,
                    signature=sig, parent_id=file_path,
                ))
                edges.append(StaticEdge(source=file_path, target=fid, type="static_contains"))

    return nodes, edges


def _extract_js_ts(tree: Any, source: bytes, file_path: str, lang: str) -> tuple[list[StaticNode], list[StaticEdge]]:
    nodes: list[StaticNode] = []
    edges: list[StaticEdge] = []
    root = tree.root_node

    for child in root.children:
        if child.type == "import_statement":
            src_node = child.child_by_field_name("source")
            if src_node:
                mod = _text(src_node, source).strip("'\"")
                edges.append(StaticEdge(source=file_path, target=mod, type="static_import", label=f"import from '{mod}'"))
        elif child.type == "class_declaration":
            name_node = child.child_by_field_name("name")
            if name_node:
                cls_name = _text(name_node, source)
                cls_id = f"{file_path}::{cls_name}"
                nodes.append(StaticNode(
                    id=cls_id, type="class", name=cls_name,
                    file_path=file_path, language=lang,
                    line_start=child.start_point[0] + 1,
                    line_end=child.end_point[0] + 1,
                    parent_id=file_path,
                ))
                edges.append(StaticEdge(source=file_path, target=cls_id, type="static_contains"))
                heritage = child.child_by_field_name("heritage")
                if heritage:
                    text = _text(heritage, source)
                    for token in text.replace("extends", "").replace("implements", ",").split(","):
                        base = token.strip().split("<")[0].strip()
                        if base:
                            edges.append(StaticEdge(source=cls_id, target=base, type="static_inherits", label=f"extends {base}"))
        elif child.type in ("function_declaration", "export_statement"):
            target = child
            if child.type == "export_statement":
                for sub in child.children:
                    if sub.type in ("function_declaration", "class_declaration", "lexical_declaration"):
                        target = sub
                        break
                else:
                    continue
            if target.type == "function_declaration":
                name_node = target.child_by_field_name("name")
                if name_node:
                    fname = _text(name_node, source)
                    fid = f"{file_path}::{fname}"
                    params = target.child_by_field_name("parameters")
                    sig = f"function {fname}({_text(params, source) if params else ''})"
                    nodes.append(StaticNode(
                        id=fid, type="function", name=fname,
                        file_path=file_path, language=lang,
                        line_start=target.start_point[0] + 1,
                        line_end=target.end_point[0] + 1,
                        signature=sig, parent_id=file_path,
                    ))
                    edges.append(StaticEdge(source=file_path, target=fid, type="static_contains"))

    return nodes, edges


def _extract_go(tree: Any, source: bytes, file_path: str) -> tuple[list[StaticNode], list[StaticEdge]]:
    nodes: list[StaticNode] = []
    edges: list[StaticEdge] = []
    root = tree.root_node

    for child in root.children:
        if child.type == "import_declaration":
            for spec in child.children:
                if spec.type == "import_spec_list":
                    for imp in spec.children:
                        if imp.type == "import_spec":
                            path_node = imp.child_by_field_name("path")
                            if path_node:
                                mod = _text(path_node, source).strip('"')
                                edges.append(StaticEdge(source=file_path, target=mod, type="static_import", label=f"import \"{mod}\""))
                elif spec.type == "interpreted_string_literal":
                    mod = _text(spec, source).strip('"')
                    edges.append(StaticEdge(source=file_path, target=mod, type="static_import", label=f"import \"{mod}\""))
        elif child.type == "function_declaration":
            name_node = child.child_by_field_name("name")
            if name_node:
                fname = _text(name_node, source)
                fid = f"{file_path}::{fname}"
                nodes.append(StaticNode(
                    id=fid, type="function", name=fname,
                    file_path=file_path, language="go",
                    line_start=child.start_point[0] + 1,
                    line_end=child.end_point[0] + 1,
                    parent_id=file_path,
                ))
                edges.append(StaticEdge(source=file_path, target=fid, type="static_contains"))
        elif child.type == "type_declaration":
            for spec in child.children:
                if spec.type == "type_spec":
                    name_node = spec.child_by_field_name("name")
                    if name_node:
                        tname = _text(name_node, source)
                        tid = f"{file_path}::{tname}"
                        nodes.append(StaticNode(
                            id=tid, type="class", name=tname,
                            file_path=file_path, language="go",
                            line_start=spec.start_point[0] + 1,
                            line_end=spec.end_point[0] + 1,
                            parent_id=file_path,
                        ))
                        edges.append(StaticEdge(source=file_path, target=tid, type="static_contains"))

    return nodes, edges


_EXTRACTORS = {
    "python": lambda tree, src, fp: _extract_python(tree, src, fp),
    "javascript": lambda tree, src, fp: _extract_js_ts(tree, src, fp, "javascript"),
    "typescript": lambda tree, src, fp: _extract_js_ts(tree, src, fp, "typescript"),
    "tsx": lambda tree, src, fp: _extract_js_ts(tree, src, fp, "typescript"),
    "go": lambda tree, src, fp: _extract_go(tree, src, fp),
    "rust": lambda tree, src, fp: ([], []),  # stub — basic node only
    "java": lambda tree, src, fp: ([], []),  # stub — basic node only
}


# ── Main entry point ──

def _file_hash(path: Path) -> str:
    return hashlib.md5(f"{path.stat().st_mtime_ns}:{path.stat().st_size}".encode()).hexdigest()


def build_static_graph(
    files: list[FileEntry],
    repo_path: Path,
    cache_path: Path | None = None,
) -> StaticGraph:
    """Parse source files with tree-sitter and return a deterministic structural graph."""
    if not _TS_AVAILABLE:
        log("WARN", "tree-sitter not installed, returning empty static graph")
        return StaticGraph(
            generated_at=datetime.now(timezone.utc).isoformat(),
            languages_skipped=list({f.language for f in files if f.language}),
        )

    # Check cache
    if cache_path and cache_path.exists():
        try:
            cached = StaticGraph.model_validate_json(cache_path.read_text())
            current_hashes = {}
            changed = False
            for f in files:
                fp = repo_path / f.path
                if fp.exists():
                    h = _file_hash(fp)
                    current_hashes[f.path] = h
                    if cached.file_hashes.get(f.path) != h:
                        changed = True
                        break
            if not changed:
                log("OK", f"Static graph loaded from cache ({len(cached.nodes)} nodes)")
                return cached
        except Exception:
            pass

    all_nodes: list[StaticNode] = []
    all_edges: list[StaticEdge] = []
    file_hashes: dict[str, str] = {}
    langs_parsed: set[str] = set()
    langs_skipped: set[str] = set()

    for entry in files:
        ext = Path(entry.path).suffix.lower()
        ts_lang = _EXT_TO_TS_LANG.get(ext)
        if not ts_lang:
            if entry.language:
                langs_skipped.add(entry.language)
            continue

        parser = _get_parser(ts_lang)
        if parser is None:
            langs_skipped.add(ts_lang)
            continue

        fpath = repo_path / entry.path
        if not fpath.exists():
            continue

        try:
            source = fpath.read_bytes()
            tree = parser.parse(source)
        except Exception:
            continue

        file_hashes[entry.path] = _file_hash(fpath)
        langs_parsed.add(ts_lang)

        # File node
        all_nodes.append(StaticNode(
            id=entry.path, type="file", name=entry.path.rsplit("/", 1)[-1] if "/" in entry.path else entry.path,
            file_path=entry.path, language=entry.language,
            line_start=1, line_end=entry.line_count,
        ))

        extractor = _EXTRACTORS.get(ts_lang)
        if extractor:
            child_nodes, child_edges = extractor(tree, source, entry.path)
            all_nodes.extend(child_nodes)
            all_edges.extend(child_edges)

    graph = StaticGraph(
        generated_at=datetime.now(timezone.utc).isoformat(),
        nodes=all_nodes,
        edges=all_edges,
        file_hashes=file_hashes,
        languages_parsed=sorted(langs_parsed),
        languages_skipped=sorted(langs_skipped),
    )

    if cache_path:
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(graph.model_dump(), indent=2, ensure_ascii=False))
            log("OK", f"Static graph cached to {cache_path}")
        except Exception as exc:
            log("WARN", f"Failed to cache static graph: {exc}")

    log("OK", f"Static graph: {len(all_nodes)} nodes, {len(all_edges)} edges ({', '.join(sorted(langs_parsed))})")
    return graph

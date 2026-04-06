# Spec: pyharness analyze phase

## Overview

New harness phase that performs deep code analysis on the target repository and outputs a structured knowledge graph JSON file.

## Entry Point

```python
# pyharness/phases/analyze.py
async def step_analyze(runner: HarnessRunner) -> None:
```

Called by `runner.run()` before the first iteration, or standalone via `python -m pyharness analyze`.

## File Tree Scanner

### Input
- `runner.config.repo_path` — absolute path to the cloned repository

### Logic
1. Walk directory tree using `os.walk` or `pathlib.rglob`
2. Apply filters:
   - Skip directories: `.git`, `node_modules`, `__pycache__`, `vendor`, `dist`, `build`, `.next`, `.cache`, `coverage`, `.tox`, `venv`, `.venv`, `env`
   - Skip files by extension: `.pyc`, `.pyo`, `.class`, `.o`, `.so`, `.dylib`, `.dll`, `.exe`, `.bin`, `.dat`, `.db`, `.sqlite`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.mp3`, `.mp4`, `.zip`, `.tar`, `.gz`, `.pdf`, `.wasm`
   - Skip files > 50KB
   - Skip lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Cargo.lock`, `Gemfile.lock`, `composer.lock`
3. If `.gitignore` exists at repo root, parse it with `pathspec` library and apply
4. For each remaining file: record `path` (relative), detect `language` from extension, count `line_count`

### Output
- `list[FileEntry]` sorted by path

### Language Detection Map
```python
LANG_MAP = {
    ".py": "python", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin",
    ".rb": "ruby", ".php": "php", ".cs": "csharp", ".cpp": "cpp",
    ".c": "c", ".h": "c", ".hpp": "cpp", ".swift": "swift",
    ".scala": "scala", ".r": "r", ".R": "r",
    ".sql": "sql", ".sh": "shell", ".bash": "shell",
    ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".json": "json", ".md": "markdown", ".html": "html", ".css": "css",
    ".scss": "scss", ".less": "less", ".vue": "vue", ".svelte": "svelte",
}
```

## Batch Analyzer

### Batching Strategy
```python
def _create_batches(files: list[FileEntry], max_lines: int = 3000) -> list[list[FileEntry]]:
```

1. Sort files by directory (files in same directory stay together)
2. Accumulate files into current batch until `sum(line_count)` exceeds `max_lines`
3. Files with `line_count > 500` get their own solo batch
4. Each batch is a `list[FileEntry]`

### Claude Invocation (per batch)
```python
async def _analyze_batch(client: ClaudeClient, batch: list[FileEntry], repo_path: Path) -> BatchResult:
```

1. Read file contents for each file in batch
2. Build prompt (see prompt template below)
3. Call `client.run(prompt, max_turns=30, response_model=BatchResult)`
4. On failure: retry up to 3 times with error context
5. On persistent failure: log to error ledger, return empty `BatchResult`

### Prompt Template
```
You are analyzing source code from the repository "{repo_name}".
Your task is to extract the code structure for a knowledge graph.

For each file below, output a JSON object with:
- "id": the file path (as given)
- "type": "file"
- "name": short display name (filename or last 2 path segments)
- "layer": one of "api", "service", "data", "ui", "infra", "util"
  - api: HTTP handlers, REST endpoints, GraphQL resolvers, CLI commands
  - service: business logic, domain services, use cases
  - data: database models, repositories, migrations, ORM
  - ui: React components, templates, views, CSS
  - infra: config, logging, monitoring, deployment, build scripts
  - util: helpers, utilities, shared types, constants
- "summary": 1-2 sentence description of what this file does (plain English)
- "language": programming language
- "line_count": number of lines
- "children": array of classes and top-level functions:
  - "id": "{filepath}::{ClassName}" or "{filepath}::{function_name}"
  - "type": "class" | "function"
  - "name": the class or function name
  - "summary": 1 sentence description
  - "signature": the full signature line
  - "line_start": starting line number
  - "line_end": ending line number
  - "children": for classes, their methods (same shape with type="method")
- "imports": array of { "from": "module/path", "names": ["Name1", "Name2"] }

Output a JSON object: { "files": [...] }

{file_contents_here}
```

### Parallel Execution
```python
semaphore = asyncio.Semaphore(runner.max_parallel)
tasks = [_analyze_with_semaphore(sem, client, batch, repo_path) for batch in batches]
results = await asyncio.gather(*tasks, return_exceptions=True)
```

## Merge & Resolve

### Input
- `list[BatchResult]` from all successful batch analyses

### Logic
1. Flatten all file nodes from all batches into a single `nodes` list
2. Build a lookup: `node_id → GraphNode` for O(1) access
3. For each file's `imports`:
   - Resolve the import path to an actual file node ID
   - Handle: relative imports (`./utils`), index files (`dir/` → `dir/index.ts`), extensions
   - Create `GraphEdge(type="import")` for each resolved import
4. Cross-reference function calls (if the batch analysis identified them)
5. Deduplicate edges: same (source, target, type) → keep one
6. Validate: every edge's source and target must exist in nodes
7. Compute stats: total_files, total_functions, total_classes, total_edges

### Output
- `KnowledgeGraph` (without tours and chapter_links, those come next)

## Tour Generator

### Input
- `KnowledgeGraph` with nodes and edges

### Logic
1. Build condensed summary for Claude:
   - List of `"{node_id}: {summary}"` (file level only)
   - List of edges: `"{source} → {target} ({type})"`
   - Total: keep under 50KB to fit in context
2. Prompt Claude to generate 2-3 guided tours
3. Validate: each tour step's `node_id` must exist in the graph

### Prompt Template
```
Based on this codebase structure, create 2-3 guided tours for someone new to this project.

Each tour should:
1. Have a clear theme (e.g., "Request Lifecycle", "Core Business Logic", "Data Pipeline")
2. Order nodes by dependency (learn prerequisites first)
3. Include a 2-3 sentence narrative per step explaining what to notice

Codebase structure:
{condensed_graph}

Output JSON: { "tours": [{ "id": "...", "name": "...", "description": "...", "steps": [{ "node_id": "...", "narrative": "..." }] }] }
```

## Chapter Link Resolution

### Input
- `KnowledgeGraph`, `runner.chapters_dir`

### Logic
1. Read all `*.json` files from chapters directory
2. For each chapter, extract:
   - `code_snippets[].source` field (if present) — often a file path
   - References to file names in section `content` (regex for common patterns)
3. Match extracted paths to graph node IDs
4. Build `chapter_links: dict[str, list[str]]` — node_id → list of chapter_ids

## SSE Logging

Emit structured log events that the dashboard can consume:

| Event | Data |
|-------|------|
| `analyze_start` | `{ "total_files": N }` |
| `analyze_scan_complete` | `{ "files_found": N, "total_lines": M }` |
| `analyze_batch_start` | `{ "batch": i, "total_batches": N, "files": [...] }` |
| `analyze_batch_complete` | `{ "batch": i, "nodes_extracted": N }` |
| `analyze_merge_complete` | `{ "total_nodes": N, "total_edges": M }` |
| `analyze_tours_complete` | `{ "tours": N }` |
| `analyze_complete` | `{ "output_path": "...", "stats": {...} }` |

## Output

File: `knowledge/{bookId}/knowledge-graph.json`

Must validate against `KnowledgeGraph` Pydantic model before writing.

Written with `json.dump(graph.model_dump(), f, indent=2, ensure_ascii=False)`.

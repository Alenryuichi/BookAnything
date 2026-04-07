# Design: Knowledge Graph — Harness-Level Code Understanding

## 1. Pyharness Backend

### 1.1 New Pydantic Models (`pyharness/schemas.py`)

```python
class GraphNodeChild(BaseModel):
    id: str                    # "path::ClassName::method_name"
    type: Literal["class", "function", "method", "constant"]
    name: str
    summary: str               # LLM-generated 1-2 sentence description
    signature: str             # e.g. "async def login(email: str) -> TokenPair"
    line_start: int
    line_end: int
    children: list["GraphNodeChild"] = []

class GraphNode(BaseModel):
    id: str                    # file path relative to repo root
    type: Literal["file", "directory"]
    name: str                  # display name (short path)
    layer: str                 # "api" | "service" | "data" | "ui" | "infra" | "util"
    summary: str               # LLM-generated description
    language: str              # "python" | "typescript" | "go" | ...
    line_count: int
    children: list[GraphNodeChild] = []

class GraphEdge(BaseModel):
    source: str                # node id
    target: str                # node id
    type: Literal["import", "call", "extend", "implement", "compose"]
    label: str                 # human-readable description

class TourStep(BaseModel):
    node_id: str
    narrative: str             # LLM-generated explanation for this step

class GuidedTour(BaseModel):
    id: str
    name: str
    description: str
    steps: list[TourStep]

class ArchLayer(BaseModel):
    id: str
    name: str
    color: str                 # hex color

class KnowledgeGraphStats(BaseModel):
    total_files: int
    total_functions: int
    total_classes: int
    total_edges: int

class KnowledgeGraph(BaseModel):
    version: str = "1.0"
    repo: str
    generated_at: str
    stats: KnowledgeGraphStats
    layers: list[ArchLayer]
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    tours: list[GuidedTour] = []
    chapter_links: dict[str, list[str]] = {}
```

### 1.2 Analyze Phase (`pyharness/phases/analyze.py`)

```
async def step_analyze(runner: HarnessRunner) -> None:
```

**Internal sub-steps:**

#### Sub-step 1: File Tree Scan (pure Python, no Claude)

```python
def _scan_file_tree(repo_path: Path) -> list[FileEntry]:
    """Walk repo, respect .gitignore, skip binary/vendor/generated files."""
```

Rules:
- Skip: `.git/`, `node_modules/`, `__pycache__/`, `vendor/`, `dist/`, `build/`, `.next/`
- Skip: binary files (detected by extension: `.png`, `.jpg`, `.wasm`, `.pyc`, etc.)
- Skip: lock files (`package-lock.json`, `yarn.lock`, `poetry.lock`, `Cargo.lock`)
- Skip: files > 50KB (likely generated/minified)
- Read `.gitignore` if present, apply patterns via `pathspec` library
- Collect: `path`, `language` (from extension), `line_count`, `size_bytes`

#### Sub-step 2: Batch Analysis (Claude CLI, parallel)

```python
async def _analyze_batch(
    client: ClaudeClient,
    batch: list[FileEntry],
    repo_path: Path,
) -> BatchResult:
    """Send a batch of files to Claude for deep analysis."""
```

Batching strategy:
- Group files by directory proximity (files in same dir likely related)
- Max ~3000 lines per batch (dynamic, not fixed file count)
- Large files (>500 lines) get their own dedicated batch
- Parallel: up to `runner.max_parallel` concurrent Claude calls

Claude prompt template (per batch):
```
You are a code architecture analyst. Analyze the following source files from a {language} project.

For EACH file, produce:
1. A 1-2 sentence summary of what this file does
2. The architecture layer it belongs to (api/service/data/ui/infra/util)
3. All classes with their methods (name, signature, 1-sentence summary, line range)
4. All top-level functions (name, signature, 1-sentence summary, line range)
5. All import statements (what is imported, from where)
6. Key relationships: which functions call which other functions (if determinable)

Output MUST be valid JSON matching this schema: { "files": [...] }

--- FILE: {path} ---
{content}
--- END ---
```

#### Sub-step 3: Merge & Resolve (pure Python)

```python
def _merge_batches(batches: list[BatchResult]) -> KnowledgeGraph:
    """Merge batch results, resolve cross-file references, deduplicate edges."""
```

Operations:
- Flatten all file nodes into `nodes` list
- Resolve import paths to actual file node IDs (handle relative imports, aliases)
- Deduplicate edges (same source+target+type)
- Compute stats
- Assign layer colors from predefined palette

#### Sub-step 4: Tour Generation (Claude CLI, single call)

```python
async def _generate_tours(
    client: ClaudeClient,
    graph: KnowledgeGraph,
) -> list[GuidedTour]:
    """Generate guided tours based on the knowledge graph structure."""
```

Send a condensed version of the graph (node IDs + summaries + edge list) to Claude. Ask for 2-3 tours:
1. **Architecture Overview**: entry point → routing → services → data
2. **Core Business Logic**: the main feature flow
3. **Infrastructure & Config**: build system, deployment, configuration

#### Sub-step 5: Chapter Link Resolution (pure Python)

```python
def _resolve_chapter_links(
    graph: KnowledgeGraph,
    chapters_dir: Path,
) -> dict[str, list[str]]:
    """Match graph nodes to existing chapters by scanning code_snippets.source."""
```

Read existing chapter JSONs, extract `code_snippets[].source` fields, match to graph node file paths.

### 1.3 CLI Integration (`pyharness/__main__.py`)

New subcommand:
```
python -m pyharness analyze --project projects/xxx.yaml [--force]
```

- `--force`: re-analyze even if `knowledge-graph.json` already exists

### 1.4 Runner Integration (`pyharness/runner.py`)

In `HarnessRunner.run()`, before the main iteration loop:

```python
kg_path = self.knowledge_dir / "knowledge-graph.json"
if not kg_path.exists():
    await step_analyze(self)
```

Add `--reanalyze` flag to `run` subcommand for explicit re-analysis.

### 1.5 Plan Phase Enhancement

The `plan` phase prompt gains access to the graph's node summaries and layer structure, enabling smarter chapter planning that aligns with actual code architecture.

---

## 2. Web App Frontend

### 2.1 New Dependency: React Flow

```bash
cd web-app && npm install @xyflow/react
```

React Flow provides:
- Built-in node types (custom via React components)
- Edge rendering with labels
- Minimap, Controls, Background
- Keyboard navigation
- Fitview, zoom, pan

### 2.2 New API Route

`GET /api/books/{bookId}/knowledge-graph`

```typescript
// web-app/app/api/books/[bookId]/knowledge-graph/route.ts
import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const kgPath = join(process.cwd(), "..", "knowledge", bookId, "knowledge-graph.json");
  
  try {
    const raw = await readFile(kgPath, "utf-8");
    return new NextResponse(raw, {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Knowledge graph not yet generated" },
      { status: 404 }
    );
  }
}
```

Query params for lazy loading:
- `?level=module` — collapse to file-level nodes only (default)
- `?level=detail` — include class/function children
- `?file={path}` — return subgraph for a specific file and its neighbors

### 2.3 Explore Page (`/books/{bookId}/explore`)

Layout:
```
┌─────────────────────────────────────────────────────┐
│ Header: "Knowledge Graph" + Book Name               │
│ [Module ▾] [File] [Function]   🔍 Search...  [Tour] │
├──────────────────────────────────┬──────────────────┤
│                                  │                  │
│                                  │  Node Detail     │
│       React Flow Canvas          │  Panel           │
│       (80% width)                │  (20% width)     │
│                                  │                  │
│                                  │  • Summary       │
│                                  │  • Signature     │
│                                  │  • Dependencies  │
│                                  │  • Dependents    │
│                                  │  • Chapters      │
│                                  │                  │
├──────────────────────────────────┴──────────────────┤
│ Minimap │ Layer Legend │ Stats (N nodes, M edges)    │
└─────────────────────────────────────────────────────┘
```

### 2.4 Component Architecture

```
web-app/components/KnowledgeGraph/
├── KnowledgeGraphPage.tsx      # Main page component (client)
├── GraphCanvas.tsx             # React Flow wrapper
├── nodes/
│   ├── FileNode.tsx            # Custom node: file with expand/collapse
│   ├── ClassNode.tsx           # Custom node: class
│   ├── FunctionNode.tsx        # Custom node: function
│   └── ModuleNode.tsx          # Collapsed directory-level node
├── NodeDetailPanel.tsx         # Right-side detail panel
├── GraphSearch.tsx             # Fuzzy search overlay
├── GraphToolbar.tsx            # View mode + filter controls
├── TourOverlay.tsx             # Guided tour step-by-step UI
├── LayerLegend.tsx             # Color legend for architecture layers
└── hooks/
    ├── useKnowledgeGraph.ts    # Data fetching + transform to React Flow format
    └── useGraphSearch.ts       # Fuzzy search with Fuse.js
```

### 2.5 View Modes

| Mode | Nodes shown | Edges shown | Use case |
|------|-------------|-------------|----------|
| Module | 1 node per directory | directory→directory | High-level architecture overview |
| File | 1 node per file | file→file (imports) | Understanding file organization |
| Function | File nodes expanded to show classes/functions | All edge types | Deep dive into specific code |

Transition between modes: animate node expansion/collapse with React Flow's `fitView()`.

### 2.6 Node Detail Panel

When a node is selected, the right panel shows:

**For file nodes:**
- File path, language, line count
- LLM summary
- List of classes/functions (clickable to expand)
- Imports (links to target nodes)
- Imported by (reverse lookup)
- Related chapters (links to chapter pages)

**For function/class nodes:**
- Signature
- LLM summary
- Line range in file
- Calls (outgoing)
- Called by (incoming)
- Parent file link

### 2.7 GraphModal Upgrade

Replace the current D3-based `DependencyGraph` + `GraphModal` with a lightweight version of the React Flow graph:
- Same data source (`/api/books/{bookId}/knowledge-graph`)
- Module-level view only (for the modal)
- "Open full explorer →" link to `/books/{bookId}/explore`

### 2.8 Chapter ↔ Graph Bidirectional Links

**In chapter reader** (`chapters/[id]/page.tsx`):
- Code snippets that reference a file path get a small "🔗 View in Graph" link
- Clicking opens `/books/{bookId}/explore?highlight={nodeId}`

**In graph explorer** (NodeDetailPanel):
- "Referenced in chapters" section lists chapter titles with links

### 2.9 Tour Mode

UI overlay on the graph canvas:
- Step counter: "Step 3 of 8"
- Current node highlighted with a pulsing ring
- Narrative text below the graph
- Next/Previous/Exit buttons
- Auto-center on current node with animation

---

## 3. Error Handling

### Pyharness
- If Claude fails to return valid JSON for a batch → retry up to 3 times with error context
- If a batch consistently fails → skip those files, log to error ledger, proceed with partial graph
- If no files can be analyzed → write an empty graph (version + stats with zeros)

### Web App
- If `knowledge-graph.json` doesn't exist → show "Knowledge graph not yet generated. Start generation to create it." with a CTA button
- If JSON is malformed → show error state, suggest re-analysis
- If graph is too large for client (>5000 nodes) → warn and default to Module view

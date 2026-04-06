# Tasks: Knowledge Graph — Harness-Level Code Understanding

## Phase 1: Pyharness Analyze Phase (Backend)

### 1.1 Pydantic Schema Models
- [x] Add `GraphNode`, `GraphNodeChild`, `GraphEdge`, `ArchLayer`, `KnowledgeGraphStats` to `pyharness/schemas.py`
- [x] Add `GuidedTour`, `TourStep`, `KnowledgeGraph` models
- [x] Add `FileEntry` model for tree scan output
- [x] Add `BatchResult` model for Claude analysis output
- [x] Write unit tests for model validation (edge cases: empty children, circular refs)

### 1.2 File Tree Scanner
- [x] Implement `_scan_file_tree(repo_path)` in `pyharness/phases/analyze.py`
- [x] Support `.gitignore` parsing via `pathspec` library (add to requirements)
- [x] Hardcoded skip list: `.git/`, `node_modules/`, `__pycache__/`, `vendor/`, `dist/`, etc.
- [x] Skip binary files by extension, skip files > 50KB
- [x] Language detection from file extension
- [x] Line count via `wc -l` equivalent
- [x] Test: fixture repo with known structure → verify file inventory output

### 1.3 Batch Analyzer
- [x] Implement `_analyze_batch(client, batch, repo_path)` — sends file contents to Claude CLI
- [x] Design Claude prompt template for code structure extraction
- [x] Implement batching strategy: group by directory, cap at ~3000 lines per batch
- [x] Large file handling: files > 500 lines get dedicated batch
- [x] JSON extraction from Claude response (reuse `_extract_json` pattern from `write.py`)
- [x] Validate batch result against `BatchResult` schema
- [x] Retry logic: up to 3 attempts per batch with error context
- [x] Test: mock Claude response → verify batch parsing

### 1.4 Merge & Resolve
- [x] Implement `_merge_batches(batches)` — flatten nodes, resolve imports, deduplicate edges
- [x] Import path resolution: handle relative imports, index files, aliases
- [x] Layer assignment validation: ensure all nodes have a valid layer
- [x] Stats computation
- [x] Test: two overlapping batches → verify correct merge

### 1.5 Tour Generator
- [x] Implement `_generate_tours(client, graph)` — send condensed graph to Claude
- [x] Design tour prompt: ask for 2-3 guided tours (architecture, business logic, infra)
- [x] Parse tour response into `GuidedTour` models
- [x] Validate tour node_ids reference real nodes in the graph
- [x] Test: mock Claude → verify tour structure

### 1.6 Chapter Link Resolver
- [x] Implement `_resolve_chapter_links(graph, chapters_dir)`
- [x] Scan chapter JSONs for `code_snippets[].source` → match to graph node IDs
- [x] Fuzzy matching: handle path variations (with/without leading `src/`)
- [x] Test: fixture chapters + graph → verify bidirectional links

### 1.7 CLI & Runner Integration
- [x] Add `analyze` subcommand to `pyharness/__main__.py`
- [x] Accept `--project` and `--force` flags
- [x] In `runner.py`: call `step_analyze` before first iteration if graph missing
- [x] Add `--reanalyze` flag to `run` subcommand
- [x] SSE log events: `analyze_start`, `analyze_scan`, `analyze_batch_N`, `analyze_merge`, `analyze_tours`, `analyze_complete`
- [x] Test: end-to-end with fixture repo → verify `knowledge-graph.json` written

---

## Phase 2: Web App — Knowledge Graph Explorer

### 2.1 Install React Flow
- [x] `cd web-app && npm install @xyflow/react`
- [x] Verify build passes with new dependency

### 2.2 API Route
- [x] Create `web-app/app/api/books/[bookId]/knowledge-graph/route.ts`
- [x] `GET` handler: read `knowledge/{bookId}/knowledge-graph.json`, return JSON
- [x] Return 404 with message if file doesn't exist
- [x] Support `?level=module` (collapse children) and `?level=detail` (full graph)
- [x] Test: curl with fixture data → verify response shape

### 2.3 Core Graph Components
- [x] `web-app/components/KnowledgeGraph/GraphCanvas.tsx` — React Flow wrapper
- [x] `web-app/components/KnowledgeGraph/hooks/useKnowledgeGraph.ts` — fetch + transform to React Flow nodes/edges
- [x] Custom node types:
  - [x] `FileNode.tsx` — shows file name, layer color, expand/collapse toggle
  - [x] `ClassNode.tsx` — class name + method count badge
  - [x] `FunctionNode.tsx` — function name + signature preview
  - [x] `ModuleNode.tsx` — directory name + file count, collapsed view
- [x] Edge styling by type: import (solid), call (dashed), extend (dotted)
- [x] Layer-based node coloring

### 2.4 Explore Page
- [x] Create `web-app/app/books/[bookId]/explore/page.tsx`
- [x] Layout: toolbar top, canvas center-left, detail panel right
- [x] Add navigation link from book detail page (`page.tsx`)
- [x] Add link in book layout sidebar
- [x] Loading state: skeleton while graph loads
- [x] Empty state: "No knowledge graph yet" with CTA to generate
- [x] Error state: graceful fallback

### 2.5 Node Detail Panel
- [x] `web-app/components/KnowledgeGraph/NodeDetailPanel.tsx`
- [x] File node: path, language, summary, children list, imports, imported-by
- [x] Class/function node: signature, summary, line range, calls, called-by
- [x] Chapter links section: list of chapters that reference this node
- [x] Click chapter link → navigate to chapter page
- [x] Click dependency → center graph on that node

### 2.6 Search & Filter
- [x] `web-app/components/KnowledgeGraph/GraphSearch.tsx` — fuzzy search with Fuse.js
- [x] Search by name, filter results by type (file/class/function)
- [x] Click search result → center on node + open detail panel
- [x] `web-app/components/KnowledgeGraph/GraphToolbar.tsx` — view mode switcher + layer filter
- [x] Layer filter: toggle visibility of nodes by architecture layer

### 2.7 View Modes
- [x] Module view: 1 node per directory, directory→directory edges
- [x] File view: 1 node per file, file→file import edges
- [x] Function view: expand files to show children, all edge types
- [x] Smooth transitions between views with `fitView()` animation
- [x] Persist view mode in URL query param (`?view=module`)

### 2.8 Tour Mode
- [x] `web-app/components/KnowledgeGraph/TourOverlay.tsx`
- [x] Tour selector dropdown (if multiple tours available)
- [x] Step-by-step navigation: prev/next/exit
- [x] Auto-center graph on current tour step node
- [x] Highlight current node with pulsing ring animation
- [x] Narrative panel below graph with step text
- [x] Tour progress indicator

---

## Phase 3: Integration & Polish

### 3.1 Upgrade GraphModal
- [x] Replace D3 `DependencyGraph.tsx` usage in `GraphModal.tsx` with React Flow `GraphCanvas`
- [x] Module-level view only in modal
- [x] Add "Open full explorer →" link to `/books/{bookId}/explore`
- [x] Remove old `graph-data` API route (replaced by `knowledge-graph` route)

### 3.2 Chapter ↔ Graph Links
- [x] In chapter reader (`chapters/[id]/page.tsx`): add "🔗 View in Graph" next to code snippets
- [x] Link format: `/books/{bookId}/explore?highlight={nodeId}`
- [x] In explore page: handle `?highlight=` query param → auto-select + center node
- [x] In NodeDetailPanel: "Referenced in chapters" → clickable chapter links

### 3.3 Dashboard Integration
- [x] Add `analyze` phase to `GenerationDashboard.tsx` phase timeline
- [x] Show analyze progress events (scanning, batch N/M, merging, tours)
- [x] When analyze completes, show "Explore Knowledge Graph →" link

### 3.4 TypeScript Compilation
- [x] `npx tsc --noEmit` passes with zero errors
- [x] All new components have proper types (no `any`)

### 3.5 Testing
- [x] Python: `pytest pyharness/phases/test_analyze.py` — unit tests for each sub-step
- [x] Web: verify explore page renders with fixture `knowledge-graph.json`
- [x] E2E: `init` a fixture repo → `analyze` → verify graph file → verify explore page

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 (Backend) | 7 work items, ~15 subtasks | 2-3 days |
| Phase 2 (Frontend) | 8 work items, ~25 subtasks | 2-3 days |
| Phase 3 (Integration) | 5 work items, ~12 subtasks | 1 day |
| **Total** | | **5-7 days** |

## Execution Order

1. **1.1** Schema models → **1.2** File tree scanner → **1.3** Batch analyzer → **1.4** Merge
2. **2.1** Install React Flow → **2.2** API route → **2.3** Core components → **2.4** Explore page
3. **1.5** Tours → **1.6** Chapter links → **1.7** CLI integration
4. **2.5** Detail panel → **2.6** Search → **2.7** View modes → **2.8** Tours
5. **3.1-3.5** Integration, polish, testing

Steps 1 and 2 can run in parallel (backend + frontend). Step 3 depends on both.

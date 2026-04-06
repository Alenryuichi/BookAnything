## ADDED Requirements

### Requirement: Read knowledge graph and extract semantic summary
The system SHALL read `knowledge-graph.json` from the book's knowledge directory and extract a structured summary containing: all Concept/Workflow/DataModel/Component nodes (id, name, summary, layer), all semantic edges (IMPLEMENTS, MUTATES, TRIGGERS, DEPENDS_ON), and layer distribution statistics.

#### Scenario: Knowledge graph with semantic nodes
- **WHEN** knowledge-graph.json contains 5 Concept nodes, 3 Workflow nodes, 2 DataModel nodes, and 15 semantic edges
- **THEN** the extracted summary includes all 10 semantic nodes with their summaries, all 15 edges with source/target/type, and a layer breakdown

#### Scenario: Knowledge graph with only file nodes
- **WHEN** knowledge-graph.json contains only file/directory nodes and import/call edges (no semantic types)
- **THEN** the extracted summary falls back to top-level file nodes grouped by layer, with edges summarized by type count

### Requirement: Compute algorithmic plan via community detection and topological sort
The system SHALL build a networkx directed graph from semantic nodes and edges, run Louvain community detection to identify Part boundaries, and perform topological sort on DEPENDS_ON edges within each community to determine chapter ordering. The system SHALL also compute node centrality to identify core concepts.

#### Scenario: Graph with 15 semantic nodes and clear dependency chains
- **WHEN** the knowledge graph contains 15 Concept/Workflow/DataModel nodes with DEPENDS_ON edges forming a DAG
- **THEN** community detection produces 2-4 communities, topological sort produces a valid linear order within each community respecting all DEPENDS_ON constraints, and the most central node is identified

#### Scenario: Graph with cycles in DEPENDS_ON edges
- **WHEN** the DEPENDS_ON subgraph contains a cycle (A → B → C → A)
- **THEN** the system breaks the weakest edge (lowest centrality endpoint), logs a warning, and produces a valid topological order on the remaining DAG

#### Scenario: Small graph with fewer than 5 semantic nodes
- **WHEN** the knowledge graph has fewer than 5 Concept/Workflow/DataModel nodes
- **THEN** community detection is skipped, all nodes are assigned to a single Part, and topological sort operates on the full set

### Requirement: Build graph-driven planning prompt with algorithmic constraints
The system SHALL construct a planning prompt that includes: project metadata (name, language, file count, line count), the algorithmic plan (pre-computed Part groupings and chapter ordering), and node summaries. The prompt SHALL instruct Claude to name Parts, write chapter titles/subtitles/outlines, and optionally adjust non-constrained ordering — but NOT change the community-based grouping or violate topological order.

#### Scenario: Prompt structure for a medium project with 3 communities
- **WHEN** the algorithmic plan has 3 communities with topo-sorted nodes and centrality scores
- **THEN** the prompt presents each community as a "Part candidate" with its ordered nodes, instructs Claude to assign Part titles, Chapter titles/subtitles, and outlines, and explicitly states "do not reorder across prerequisite constraints"

### Requirement: Call Claude with constrained planning prompt
The system SHALL invoke `ClaudeClient` with the graph-driven prompt, `cwd` set to the repository path, `max_turns=30`, and allowed tools `["Read", "Glob", "Grep"]`. The system SHALL parse the response as JSON with a `parts[].chapters[]` structure.

#### Scenario: Successful Claude response
- **WHEN** Claude returns valid JSON with `parts` array containing chapters with id, title, subtitle, sources, prerequisites, outline, kg_coverage
- **THEN** the system returns the parsed JSON for YAML and outline generation

#### Scenario: Claude returns invalid JSON
- **WHEN** Claude returns text that cannot be parsed as JSON
- **THEN** the system attempts extraction (strip markdown fences, find outermost `{}`) and falls back to `_generate_fallback_skeleton()` if all parsing fails

### Requirement: Write chapter-outline.json separately from knowledge-graph.json
The system SHALL write a `chapter-outline.json` file alongside `knowledge-graph.json` containing: algorithm metadata (community method, number of communities, topo_sort validity), parts with chapters including `kg_coverage` (list of KG node IDs covered by each chapter), and `uncovered_nodes` (KG semantic nodes not referenced by any chapter).

#### Scenario: All semantic nodes covered
- **WHEN** every Concept/Workflow/DataModel node appears in at least one chapter's `kg_coverage`
- **THEN** `uncovered_nodes` is an empty list

#### Scenario: Some nodes uncovered
- **WHEN** 3 out of 12 semantic nodes are not referenced by any chapter
- **THEN** `uncovered_nodes` contains those 3 node IDs, and a warning is logged

### Requirement: Support partial graph completeness
The system SHALL accept a `completeness` parameter (0.0–1.0). When `completeness < 1.0`, the planning prompt SHALL include a note that the graph is a partial analysis result and may be missing concepts.

#### Scenario: Partial graph with completeness 0.6
- **WHEN** `plan_from_graph()` is called with `completeness=0.6`
- **THEN** the prompt includes "Note: this graph represents approximately 60% of the codebase analysis" and the outline is tagged with `draft: true`

### Requirement: Output matches existing chapter plan schema
The system SHALL output a dict with the same structure as `plan_chapters()`: `{"project_name": str, "description": str, "parts": [{"part_num": int, "part_title": str, "chapters": [...]}]}`. Each chapter SHALL have: `id`, `title`, `subtitle`, `sources`, `prerequisites`, `outline`.

#### Scenario: Output is compatible with generate_yaml
- **WHEN** `plan_from_graph()` returns a plan dict
- **THEN** passing it to `generate_yaml(scan, plan, output_dir)` produces a valid YAML parseable by `load_project_config()`

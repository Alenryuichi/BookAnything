## MODIFIED Requirements

### Requirement: Init subcommand available via CLI
The system SHALL expose a `python3 -m pyharness init <repo_path>` subcommand that initializes a new project config from a target repository. The init pipeline SHALL execute seven phases in order: (1) scan repo, (2) build static graph via tree-sitter, (3) generate skeleton YAML without chapters, (4) analyze code to build knowledge graph (LLM semantic enrichment on top of static graph), (5) validate graph quality, (6) plan chapters from knowledge graph (community detection + topo sort + LLM polish), (7) write final YAML with chapters + chapter-outline.json.

#### Scenario: Basic invocation with full pipeline
- **WHEN** user runs `python3 -m pyharness init /path/to/repo`
- **THEN** the system scans the repo, builds a static graph with tree-sitter, generates a skeleton YAML, runs LLM analysis to produce knowledge-graph.json, validates the graph, uses community detection + topo sort + LLM to plan chapters, writes the final YAML with chapters and chapter-outline.json, and prints the output path

#### Scenario: Non-existent repo path
- **WHEN** user runs `python3 -m pyharness init /nonexistent/path`
- **THEN** the system prints an error message and exits with code 1

#### Scenario: Analyze fails gracefully
- **WHEN** the code analysis phase fails (e.g., Claude CLI error)
- **THEN** the system logs a warning, falls back to directory-based chapter planning (`_generate_fallback_skeleton`) with static graph structure still available, and still produces a valid YAML

#### Scenario: Knowledge graph already exists
- **WHEN** user runs init on a project that already has knowledge-graph.json in the knowledge directory
- **THEN** the system skips the analyze phase, runs validation on the existing graph, and uses it for chapter planning

#### Scenario: Tree-sitter not available for some files
- **WHEN** some source files are in languages without tree-sitter grammar support
- **THEN** the static graph contains those files as bare nodes without extracted structure, and the LLM analysis phase handles them with full file content as before

#### Scenario: Progress logging across all seven phases
- **WHEN** init runs the full pipeline
- **THEN** each phase emits `hlog()` calls with distinct `phase` tags: `scan`, `static-graph`, `yaml`, `analyze`, `validate`, `graph-plan`, `yaml` — visible in SSE stream and TerminalLoader

#### Scenario: Force re-analysis
- **WHEN** user runs `python3 -m pyharness init /path/to/repo --force`
- **THEN** the system rebuilds the static graph, re-runs analyze even if knowledge-graph.json exists, and regenerates the chapter outline

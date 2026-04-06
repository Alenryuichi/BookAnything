## ADDED Requirements

### Requirement: Build deterministic static graph from source files using tree-sitter
The system SHALL parse source files using tree-sitter AST parsing to extract a deterministic structural graph containing: import/export edges, function and class declarations as nodes, call edges between functions, and class inheritance relationships. This graph SHALL be produced with zero LLM token cost.

#### Scenario: Python project with imports and classes
- **WHEN** `build_static_graph()` is called on a repo containing Python files with `import` statements, class definitions, and function definitions
- **THEN** the returned `StaticGraph` contains file nodes, function/class child nodes, `static_import` edges matching the import statements, `static_call` edges for function calls, and `static_inherits` edges for class inheritance

#### Scenario: TypeScript project with ES module imports
- **WHEN** the repo contains `.ts`/`.tsx` files with `import { X } from './module'` statements
- **THEN** the `StaticGraph` contains `static_import` edges from the importing file to the resolved target file

#### Scenario: Unsupported language fallback
- **WHEN** a file's language has no tree-sitter grammar available (e.g., an exotic DSL)
- **THEN** the file is included as a bare node in the `StaticGraph` with no extracted children or edges, and no error is raised

### Requirement: Language adapter pattern
The system SHALL provide per-language extraction functions (`_extract_python`, `_extract_typescript`, `_extract_javascript`, `_extract_go`, `_extract_rust`, `_extract_java`) that each return a unified `list[StaticNode]` + `list[StaticEdge]` from the tree-sitter AST.

#### Scenario: Adding a new language
- **WHEN** a developer wants to add support for a new language (e.g., Kotlin)
- **THEN** they implement a single `_extract_kotlin(tree, source, file_path)` function returning `StaticNode` + `StaticEdge` lists, and register it in the language dispatch map

### Requirement: Optional caching of static graph
The system SHALL support writing the `StaticGraph` to `knowledge/static-graph.json` with file mtime hashes. On subsequent runs, only files whose mtime has changed SHALL be re-parsed.

#### Scenario: Second init run with no file changes
- **WHEN** `build_static_graph()` is called and `knowledge/static-graph.json` exists with matching file hashes
- **THEN** the cached graph is loaded directly without re-parsing any files

#### Scenario: Second init run with some changed files
- **WHEN** 3 out of 50 files have changed since the last static graph build
- **THEN** only those 3 files are re-parsed, and their nodes/edges are merged back into the cached graph

### Requirement: Static graph feeds into analyze phase
The system SHALL pass the `StaticGraph` to `step_analyze()` so that batch prompts can reference pre-extracted structure (function signatures, import lists, class hierarchies) instead of full file contents, reducing LLM token consumption.

#### Scenario: Batch prompt with static graph available
- **WHEN** `_build_batch_prompt()` receives a `StaticGraph` with pre-extracted imports and class hierarchy for the batch files
- **THEN** the prompt includes a structured summary section (function signatures, import lists) instead of full file text, and instructs Claude to "add semantic labels to the following pre-extracted structure"

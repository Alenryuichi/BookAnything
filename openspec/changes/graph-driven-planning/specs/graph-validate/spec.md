## ADDED Requirements

### Requirement: Validate graph quality after merge with deterministic checks
The system SHALL run a set of deterministic (no LLM) quality checks on the merged `KnowledgeGraph` and return a list of `GraphWarning` objects. This validation runs between the merge step and the planning step.

#### Scenario: Graph with orphaned semantic nodes
- **WHEN** 3 Concept nodes exist but have no edges connecting them to any other node
- **THEN** `validate_graph()` returns warnings of type `orphan_semantic_node` for each of the 3 nodes

#### Scenario: Graph with dangling edges
- **WHEN** an edge references a `source` or `target` ID not present in the node map
- **THEN** `validate_graph()` returns a warning of type `dangling_edge` with the invalid edge details

#### Scenario: Graph with suspected duplicate concepts
- **WHEN** two Concept nodes have names with normalized edit distance > 0.85 (e.g., "AuthService" and "AuthenticationService")
- **THEN** `validate_graph()` returns a warning of type `suspected_duplicate` with both node IDs

#### Scenario: Graph with layer assignment anomaly
- **WHEN** a file node at path `src/api/users.ts` is labeled with layer `data` instead of the heuristically expected `api`
- **THEN** `validate_graph()` returns a warning of type `layer_mismatch` for that node

#### Scenario: Disconnected semantic subgraph
- **WHEN** the semantic nodes (excluding file-only nodes) form 3 separate connected components
- **THEN** `validate_graph()` returns an info-level warning of type `disconnected_components` with component count

### Requirement: Log validation results and emit SSE events for severe issues
The system SHALL log all warnings via `hlog()`. When more than 30% of semantic nodes are orphaned, the system SHALL emit a warning-level SSE log event with `phase: "validate"` so the frontend can display it.

#### Scenario: Severe orphan ratio
- **WHEN** 8 out of 12 semantic nodes (66%) have no edges
- **THEN** an SSE log event with `level: "warn"`, `phase: "validate"`, `message: "66% of semantic nodes have no connections"` is emitted

#### Scenario: Normal validation with minor issues
- **WHEN** 1 out of 15 semantic nodes is orphaned (6.7%)
- **THEN** the warning is logged locally but no SSE warning event is emitted (below 30% threshold)

### Requirement: Validation does not block the pipeline
The system SHALL never fail or abort the init pipeline due to validation warnings. All warnings are informational and recorded for diagnostics.

#### Scenario: Many warnings but pipeline continues
- **WHEN** `validate_graph()` returns 20 warnings including orphans, duplicates, and layer mismatches
- **THEN** all warnings are logged, the init pipeline continues to the graph-plan phase without interruption

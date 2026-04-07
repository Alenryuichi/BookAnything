## ADDED Requirements

### Requirement: Severe graph validation events are threshold-based
The system SHALL emit a severe graph validation SSE event only when orphaned semantic nodes exceed 30 percent of all semantic nodes in the merged graph.

#### Scenario: Orphan rate exceeds threshold
- **WHEN** validation finds 4 orphaned semantic nodes out of 10 semantic nodes
- **THEN** the init job emits a `graph_validate` event that includes the orphan count and warning summary

#### Scenario: Orphan rate below threshold
- **WHEN** validation finds 2 orphaned semantic nodes out of 10 semantic nodes
- **THEN** the init job logs the warnings but does not emit a severe `graph_validate` SSE event

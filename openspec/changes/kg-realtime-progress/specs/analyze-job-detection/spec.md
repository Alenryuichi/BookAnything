## ADDED Requirements

### Requirement: Detect active analyze job on page load

When the explore page loads and no knowledge graph exists, the system SHALL check for an active analyze job associated with the current bookId. If one is found, the system SHALL immediately enter the progress view and connect to the SSE stream.

#### Scenario: User navigates to /explore while analysis is running
- **WHEN** user opens `/books/{bookId}/explore` and `knowledge-graph.json` does not exist and an active job is running for this bookId
- **THEN** the system SHALL fetch `GET /api/books/{bookId}/active-job`, receive `{ jobId, state, progress }`, and immediately render the `AnalyzeProgress` component connected to `/api/jobs/{jobId}/stream`

#### Scenario: User navigates to /explore with no active job and no graph
- **WHEN** user opens `/books/{bookId}/explore` and `knowledge-graph.json` does not exist and no active job is running
- **THEN** the system SHALL display the `EmptyState` component with the "Generate Knowledge Graph" button

#### Scenario: User navigates to /explore with existing graph
- **WHEN** user opens `/books/{bookId}/explore` and `knowledge-graph.json` exists
- **THEN** the system SHALL render the React Flow graph directly, without checking for active jobs

### Requirement: Detection flow ordering

The system SHALL follow a strict detection order: first check for the knowledge graph file, then check for an active job. This avoids unnecessary API calls.

#### Scenario: Graph exists — no active-job check
- **WHEN** `GET /api/books/{bookId}/knowledge-graph` returns 200
- **THEN** the system SHALL NOT call `GET /api/books/{bookId}/active-job`

#### Scenario: Graph missing — check for active job
- **WHEN** `GET /api/books/{bookId}/knowledge-graph` returns 404
- **THEN** the system SHALL call `GET /api/books/{bookId}/active-job` to determine if analysis is already in progress

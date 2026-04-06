## MODIFIED Requirements

### Requirement: Expose book initialization API
The system SHALL provide a `POST /api/books` endpoint that accepts a repository URL or local path and initiates the `pyharness init` process. The init process now includes analyze and graph-plan phases, so SSE log events SHALL include phase tags for `clone`, `scan`, `yaml`, `analyze`, `graph-plan`, and `done`.

#### Scenario: Successful initialization with full pipeline
- **WHEN** user sends `POST /api/books` with a valid `repo_path` payload
- **THEN** the system executes `pyharness init` which runs scan → skeleton YAML → analyze → graph-plan → final YAML, streaming progress via SSE with phase-specific log events, and returns a jobId

#### Scenario: SSE progress includes analyze phase
- **WHEN** the init job enters the analyze phase
- **THEN** SSE log events with `phase: "analyze"` and progress values between 18-70% are emitted, allowing the frontend to display "Analyzing code structure..."

#### Scenario: SSE progress includes graph-plan phase
- **WHEN** the init job enters the graph-plan phase
- **THEN** SSE log events with `phase: "graph-plan"` and progress values between 70-90% are emitted, allowing the frontend to display "Planning chapters from knowledge graph..."

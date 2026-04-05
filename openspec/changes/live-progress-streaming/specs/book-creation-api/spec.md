## MODIFIED Requirements

### Requirement: Expose book initialization API
The system SHALL provide a `POST /api/books` endpoint that accepts a repository URL or local path. Instead of blocking until initialization completes, the endpoint SHALL immediately return a `jobId` and dispatch the work to a background job.

#### Scenario: Successful dispatch
- **WHEN** user sends `POST /api/books` with a valid `repo_path` payload
- **THEN** the system SHALL return `202 Accepted` with `{ jobId: string }` within 500ms, and the background job SHALL clone the repository (if remote) and execute `pyharness init` asynchronously.

#### Scenario: Invalid repository
- **WHEN** user sends `POST /api/books` with an empty or malformed `repo_path`
- **THEN** the system SHALL return `400 Bad Request` synchronously (no job created).

#### Scenario: Job completion callback
- **WHEN** the background `pyharness init` job completes successfully
- **THEN** the system SHALL run `scripts/rebuild-index.sh`, invalidate the index cache, and transition the job state to `done`.

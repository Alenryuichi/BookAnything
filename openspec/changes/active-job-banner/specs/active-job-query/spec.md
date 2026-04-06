## ADDED Requirements

### Requirement: Job tracks associated bookId
The job manager SHALL accept an optional `bookId` when spawning a job and store it on the `Job` record. The `bookId` field SHALL be queryable to find active jobs for a given book.

#### Scenario: Spawn job with bookId
- **WHEN** `spawn()` is called with `bookId: "autoresearch"` in options
- **THEN** the created `Job` record SHALL have `bookId` set to `"autoresearch"`

#### Scenario: Spawn job without bookId
- **WHEN** `spawn()` is called without `bookId`
- **THEN** the created `Job` record SHALL have `bookId` as `undefined`

### Requirement: Find active job by bookId
The job manager SHALL provide a `findActiveByBook(bookId: string)` method that returns the first active (queued or running) job associated with the given `bookId`, or `null` if none exists.

#### Scenario: Active job exists for book
- **WHEN** a job with `bookId: "autoresearch"` is running
- **AND** `findActiveByBook("autoresearch")` is called
- **THEN** the method SHALL return that job

#### Scenario: No active job for book
- **WHEN** no queued or running job has `bookId: "autoresearch"`
- **AND** `findActiveByBook("autoresearch")` is called
- **THEN** the method SHALL return `null`

#### Scenario: Completed job is excluded
- **WHEN** a job with `bookId: "autoresearch"` has state `"done"` or `"failed"`
- **AND** `findActiveByBook("autoresearch")` is called
- **THEN** the method SHALL return `null`

### Requirement: Active job query API endpoint
The system SHALL provide a `GET /api/books/{bookId}/active-job` endpoint. If an active job exists for the given `bookId`, it SHALL return 200 with `{ jobId, state, progress }`. If no active job exists, it SHALL return 404.

#### Scenario: Active job found
- **WHEN** `GET /api/books/autoresearch/active-job` is called
- **AND** a running job with `bookId: "autoresearch"` exists at 42% progress
- **THEN** the response SHALL be 200 with `{ "jobId": "<uuid>", "state": "running", "progress": 42 }`

#### Scenario: No active job
- **WHEN** `GET /api/books/autoresearch/active-job` is called
- **AND** no active job exists for `"autoresearch"`
- **THEN** the response SHALL be 404

### Requirement: Generate route uses structural bookId for duplicate detection
The `POST /api/books/{bookId}/generate` endpoint SHALL use `findActiveByBook(bookId)` to check for an existing active job, replacing the current log-content string scan.

#### Scenario: Duplicate job prevented
- **WHEN** a running job already has `bookId: "autoresearch"`
- **AND** `POST /api/books/autoresearch/generate` is called
- **THEN** the endpoint SHALL return 200 with the existing `jobId` without spawning a new job

#### Scenario: Generate route passes bookId to spawn
- **WHEN** `POST /api/books/autoresearch/generate` spawns a new job
- **THEN** the job SHALL be created with `bookId: "autoresearch"`

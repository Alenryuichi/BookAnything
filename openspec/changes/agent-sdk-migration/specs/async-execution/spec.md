## ADDED Requirements

### Requirement: Parallel chapter writing with concurrency limit
The system SHALL execute chapter writing tasks concurrently using `asyncio.gather()` with an `asyncio.Semaphore` controlling the maximum number of simultaneous writes, configured via `max_parallel`.

#### Scenario: Respecting concurrency limit
- **WHEN** the plan specifies 5 chapters to write and `max_parallel` is 3
- **THEN** the system SHALL run at most 3 chapter-writing tasks concurrently, queuing the remaining 2 until a slot opens

#### Scenario: All chapters complete
- **WHEN** all parallel chapter writes finish (with or without errors)
- **THEN** the system SHALL collect all results and report per-chapter success/failure status

### Requirement: Per-chapter error isolation
The system SHALL isolate errors in individual chapter writes so that a failure in one chapter does not abort other in-progress chapters.

#### Scenario: One chapter fails
- **WHEN** one chapter write raises an exception while others are in progress
- **THEN** the remaining chapters SHALL continue executing and the failed chapter SHALL be recorded in the results with its error

#### Scenario: All chapters fail
- **WHEN** all chapter writes raise exceptions
- **THEN** the system SHALL log all errors and continue to the next phase (matching bash behavior where the loop continues)

### Requirement: Timeout per Claude SDK call
The system SHALL enforce a configurable timeout (default 600 seconds) on each Claude Agent SDK call, matching the `CLAUDE_TIMEOUT` behavior in `run.sh`.

#### Scenario: Call exceeds timeout
- **WHEN** a Claude SDK call does not complete within the timeout
- **THEN** the system SHALL cancel the call, log a timeout error, and treat it as a failed chapter write

#### Scenario: Timeout is configurable
- **WHEN** `CLAUDE_TIMEOUT` environment variable is set to a custom value
- **THEN** the system SHALL use that value as the per-call timeout in seconds

### Requirement: Retry logic for transient failures
The system SHALL retry failed Claude SDK calls up to a configurable number of attempts (default: 2 retries) with exponential backoff for transient errors (network errors, rate limits, 5xx responses).

#### Scenario: Transient error with successful retry
- **WHEN** a Claude SDK call fails with a transient error and retry attempts remain
- **THEN** the system SHALL wait with exponential backoff and retry the call

#### Scenario: All retries exhausted
- **WHEN** a Claude SDK call fails on all retry attempts
- **THEN** the system SHALL record the final error and move on (no crash)

#### Scenario: Non-transient error
- **WHEN** a Claude SDK call fails with a non-transient error (400 bad request, invalid model)
- **THEN** the system SHALL NOT retry and SHALL immediately record the error

### Requirement: Async state updates are atomic
The system SHALL ensure that concurrent chapter writes do not corrupt `state.json` by serializing state updates through an `asyncio.Lock`.

#### Scenario: Concurrent state update
- **WHEN** two chapter writes complete at the same time and both attempt to update state
- **THEN** the updates SHALL be serialized and `state.json` SHALL reflect both changes without data loss

## ADDED Requirements

### Requirement: Job lifecycle management
The system SHALL maintain an in-process registry of background jobs. Each job SHALL have a unique ID (UUID v4) and a state that transitions through: `queued → running → done | failed`.

#### Scenario: Job creation
- **WHEN** a new job is requested with a command string and working directory
- **THEN** the system SHALL create a job entry with state `queued`, spawn the command as a child process, transition to `running`, and begin capturing stdout/stderr to a log sink file.

#### Scenario: Job completion
- **WHEN** a running job's child process exits with code 0
- **THEN** the system SHALL transition the job state to `done` and record the exit timestamp.

#### Scenario: Job failure
- **WHEN** a running job's child process exits with a non-zero code or is killed
- **THEN** the system SHALL transition the job state to `failed`, record the exit code, and retain captured logs for debugging.

### Requirement: Job status query
The system SHALL provide a `GET /api/jobs/[jobId]` endpoint that returns the current state of a job including its ID, state, start time, and accumulated log lines.

#### Scenario: Query existing job
- **WHEN** a client sends `GET /api/jobs/{jobId}` for a valid job ID
- **THEN** the system SHALL return a JSON response with `{ id, state, startedAt, logs: string[], progress, exitCode? }`.

#### Scenario: Query unknown job
- **WHEN** a client sends `GET /api/jobs/{jobId}` for a non-existent job ID
- **THEN** the system SHALL return `404 Not Found`.

### Requirement: Job auto-eviction
The system SHALL automatically remove completed or failed jobs from the registry after 30 minutes to prevent memory leaks.

#### Scenario: Eviction of old completed job
- **WHEN** a job has been in `done` or `failed` state for longer than 30 minutes
- **THEN** the system SHALL remove the job from the registry and delete its log sink file.

### Requirement: Concurrent job limit
The system SHALL enforce a maximum of 10 concurrent active jobs (state `queued` or `running`). Requests beyond this limit SHALL be rejected.

#### Scenario: Job limit exceeded
- **WHEN** a new job is requested while 10 jobs are already active
- **THEN** the system SHALL return `429 Too Many Requests` with a descriptive error message.

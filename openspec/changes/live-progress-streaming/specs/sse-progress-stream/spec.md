## ADDED Requirements

### Requirement: SSE streaming endpoint
The system SHALL provide a `GET /api/jobs/[jobId]/stream` endpoint that returns a `text/event-stream` response, pushing structured log events in real time as the associated job runs.

#### Scenario: Active job streaming
- **WHEN** a client connects to `GET /api/jobs/{jobId}/stream` for a running job
- **THEN** the system SHALL send all previously accumulated log lines immediately, then continue pushing new lines as SSE `data:` events until the job completes.

#### Scenario: Completed job streaming
- **WHEN** a client connects to `GET /api/jobs/{jobId}/stream` for a job in `done` or `failed` state
- **THEN** the system SHALL send all accumulated log lines followed by a terminal `event: done` or `event: error` SSE event, then close the stream.

#### Scenario: Unknown job streaming
- **WHEN** a client connects to `GET /api/jobs/{jobId}/stream` for a non-existent job ID
- **THEN** the system SHALL return `404 Not Found` (not an SSE stream).

### Requirement: SSE event format
Each SSE event SHALL carry a JSON payload with the structure `{ level: string, message: string, timestamp: string, phase?: string, progress?: number }`.

#### Scenario: Log event payload
- **WHEN** the backend emits a log line with level "STEP" and message "Phase 2/7: Writing Chapters..."
- **THEN** the SSE event SHALL be `data: {"level":"STEP","message":"Phase 2/7: Writing Chapters...","timestamp":"14:30:25","progress":28}\n\n`.

### Requirement: SSE reconnection support
The system SHALL include an `id` field in each SSE event (monotonically increasing integer). If a client reconnects with a `Last-Event-ID` header, the server SHALL replay only events after the specified ID.

#### Scenario: Client reconnects after disconnect
- **WHEN** a client reconnects with `Last-Event-ID: 15`
- **THEN** the system SHALL send events starting from ID 16 onward, skipping already-delivered events.

### Requirement: Structured log output from pyharness
`pyharness/log.py` SHALL support a `--log-sink` CLI argument that, when provided, writes each log entry as a JSON-lines record to the specified file path in addition to the existing stdout output.

#### Scenario: JSON-lines log sink
- **WHEN** `pyharness` is invoked with `--log-sink /tmp/job-abc.jsonl`
- **THEN** each call to `log(level, msg)` SHALL append a JSON object `{"ts":"HH:MM:SS","level":"INFO","msg":"..."}` followed by a newline to `/tmp/job-abc.jsonl`.

#### Scenario: No log sink specified
- **WHEN** `pyharness` is invoked without `--log-sink`
- **THEN** logging behavior SHALL remain unchanged (stdout + optional file in log_dir).

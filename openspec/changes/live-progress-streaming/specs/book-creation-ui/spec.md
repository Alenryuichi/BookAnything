## MODIFIED Requirements

### Requirement: Book creation wizard page
The system SHALL provide a `/books/new` UI wizard that prompts the user for a repository URL and submits it to the creation API. Upon receiving a `jobId` from the API, the wizard SHALL display a real-time terminal log stream powered by SSE instead of simulated fake logs.

#### Scenario: Submitting a valid repository
- **WHEN** the user enters a repo path in `/books/new` and clicks "Create Book"
- **THEN** the UI SHALL call `POST /api/books`, receive a `jobId`, and immediately render the `TerminalLoader` component connected to `GET /api/jobs/{jobId}/stream`.

#### Scenario: Real-time log display
- **WHEN** the SSE stream emits a new log event
- **THEN** the `TerminalLoader` SHALL append the message to its terminal display and update the progress bar to reflect the `progress` field value.

#### Scenario: Job completion in UI
- **WHEN** the SSE stream emits a `done` event
- **THEN** the UI SHALL set the progress bar to 100%, display a success message, and redirect the user to the newly created book's page.

#### Scenario: Job failure in UI
- **WHEN** the SSE stream emits an `error` event
- **THEN** the UI SHALL display the error message in the terminal log, set the progress bar to red/error state, and show a "Retry" button.

#### Scenario: SSE connection loss
- **WHEN** the `EventSource` connection drops unexpectedly
- **THEN** the browser SHALL automatically reconnect (native `EventSource` behavior) and resume from the last received event ID without duplicating displayed logs.

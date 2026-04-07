## ADDED Requirements

### Requirement: Real-time progress display during analyze phase

The system SHALL display a real-time progress view when a knowledge graph analysis is in progress. The progress view MUST show 5 distinct phases: Scanning files, Analyzing code, Merging results, Generating tours, and Finalizing. Each phase SHALL have a visual indicator showing whether it is pending, active, or complete.

#### Scenario: User clicks "Generate Knowledge Graph" and sees live progress
- **WHEN** user clicks the "Generate Knowledge Graph" button on the explore page
- **THEN** the system starts the analyze job, connects to the SSE stream, and displays the `AnalyzeProgress` component with a progress bar and step list

#### Scenario: File scanning phase completes
- **WHEN** the SSE stream emits an `analyze_scan_complete` event with `{ files_found, files_skipped }`
- **THEN** the "Scanning files" step shows as complete with the file count, and the "Analyzing code" step becomes active

#### Scenario: Batch analysis shows fine-grained progress
- **WHEN** the SSE stream emits `analyze_batches_created` with `{ total_batches }` followed by individual `analyze_batch_complete` events
- **THEN** the progress bar within the "Analyzing code" step SHALL advance proportionally (completed_batches / total_batches), and the step label SHALL display "Batch X / Y"

#### Scenario: All phases complete
- **WHEN** the SSE stream emits `analyze_complete`
- **THEN** the progress view SHALL show a "Analysis complete!" message for approximately 1 second, then automatically transition to the React Flow graph visualization without a full page reload

### Requirement: Error handling during analysis

The system SHALL display actionable error information when analysis fails and provide a retry mechanism.

#### Scenario: Analysis job fails
- **WHEN** the SSE stream emits an `error` event or the job state transitions to `failed`
- **THEN** the progress view SHALL display the error message from the event and show a "Retry" button that triggers a new analysis job

#### Scenario: SSE connection lost
- **WHEN** the EventSource connection to the SSE stream is terminated unexpectedly
- **THEN** the system SHALL attempt to reconnect automatically. If reconnection fails after 3 attempts, the system SHALL display "Connection lost" with a manual "Refresh" button

### Requirement: Progress bar with weighted phases

The system SHALL compute an overall progress percentage using weighted phase allocation: Scanning (10%), Analyzing (60%), Merging (15%), Tours (10%), Finalizing (5%).

#### Scenario: Progress bar reflects phase weights during batch analysis
- **WHEN** 3 out of 10 total batches have completed during the "Analyzing code" phase
- **THEN** the overall progress bar SHALL display approximately 10% + (3/10 × 60%) = 28%

#### Scenario: Progress bar reaches 100% on completion
- **WHEN** the `analyze_complete` event is received
- **THEN** the progress bar SHALL display 100%

### Requirement: Seamless transition to graph view on completion

The system SHALL transition from the progress view to the graph visualization without a full page reload.

#### Scenario: Graph data loaded after analysis
- **WHEN** analysis completes and the system re-fetches `/api/books/{bookId}/knowledge-graph`
- **THEN** the page SHALL render the React Flow graph directly via React state update, without calling `window.location.reload()`

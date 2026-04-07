## ADDED Requirements

### Requirement: Active job detection on book detail page
The `StartGenerationButton` component SHALL poll `GET /api/books/{bookId}/active-job` on mount and every 3 seconds thereafter to detect active generation jobs.

#### Scenario: Poll detects active job
- **WHEN** the book detail page renders with `bookId: "autoresearch"`
- **AND** an active job exists for that book
- **THEN** the component SHALL display a status banner instead of the default button

#### Scenario: Poll detects no active job
- **WHEN** the book detail page renders with `bookId: "autoresearch"`
- **AND** no active job exists for that book
- **THEN** the component SHALL display the "Start Generation" button

#### Scenario: Polling stops when unmounted
- **WHEN** the user navigates away from the book detail page
- **THEN** the polling interval SHALL be cleared

### Requirement: Status banner displays job state
When an active job is detected, the status banner SHALL display the job state (e.g., "running"), a progress percentage, and a "View Dashboard" link that navigates to `/books/{bookId}/dashboard?jobId={jobId}`.

#### Scenario: Banner content
- **WHEN** an active job with `state: "running"` and `progress: 65` is detected
- **THEN** the banner SHALL display a progress indicator showing 65%
- **AND** the banner SHALL include a link labeled "View Dashboard" pointing to the dashboard with the correct jobId

#### Scenario: Job completes while viewing banner
- **WHEN** the polled active-job API returns 404 (no active job)
- **AND** the banner was previously showing
- **THEN** the component SHALL revert to displaying the "Start Generation" button

### Requirement: Start button disabled during active job
The "Start Generation" button SHALL be disabled and visually indicate that generation is already in progress when an active job is detected.

#### Scenario: Button disabled state
- **WHEN** an active job is detected
- **THEN** the "Start Generation" button SHALL NOT be clickable
- **AND** the button area SHALL be replaced by the status banner

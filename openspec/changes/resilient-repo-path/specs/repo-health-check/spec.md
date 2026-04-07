## ADDED Requirements

### Requirement: Repo status API endpoint

The system SHALL provide a `GET /api/books/{bookId}/repo-status` endpoint that returns the availability status of the repository associated with a book.

#### Scenario: Repository exists
- **WHEN** the resolved `repo_path` directory exists on disk
- **THEN** the API SHALL return `200` with `{ "available": true, "path": "<repo_path>", "remote_url": "<url or null>" }`

#### Scenario: Repository missing with remote URL
- **WHEN** the resolved `repo_path` does not exist and `remote_url` is configured
- **THEN** the API SHALL return `200` with `{ "available": false, "path": "<repo_path>", "remote_url": "<url>", "canReclone": true }`

#### Scenario: Repository missing without remote URL
- **WHEN** the resolved `repo_path` does not exist and no `remote_url` is configured
- **THEN** the API SHALL return `200` with `{ "available": false, "path": "<repo_path>", "remote_url": null, "canReclone": false }`

#### Scenario: No project YAML found
- **WHEN** no project YAML exists for the given bookId
- **THEN** the API SHALL return `404` with `{ "error": "No project YAML found" }`

### Requirement: Frontend repo-missing UI

The frontend SHALL display a clear error state with actionable options when a repo is unavailable, instead of proceeding to operations that will fail.

#### Scenario: Repo missing with re-clone option
- **WHEN** the user navigates to `/books/{bookId}/explore` and the repo is unavailable but `canReclone` is true
- **THEN** the UI SHALL display the missing path, the remote URL, and a "Re-clone Repository" button

#### Scenario: Repo missing without re-clone option
- **WHEN** the user navigates to `/books/{bookId}/explore` and the repo is unavailable and `canReclone` is false
- **THEN** the UI SHALL display the missing path and a message instructing the user to verify the path in the project YAML

### Requirement: Re-clone from frontend

The system SHALL provide a `POST /api/books/{bookId}/reclone` endpoint that triggers a git clone of the `remote_url` to the configured `repo_path`.

#### Scenario: Successful re-clone
- **WHEN** user clicks "Re-clone Repository" and the clone succeeds
- **THEN** the UI SHALL refresh and the repo status SHALL show `available: true`

#### Scenario: Re-clone failure
- **WHEN** user clicks "Re-clone Repository" and the clone fails
- **THEN** the UI SHALL display the error message from the clone attempt

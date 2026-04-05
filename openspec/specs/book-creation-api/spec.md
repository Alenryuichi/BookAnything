# book-creation-api Specification

## Purpose
TBD - created by archiving change book-creation-wizard. Update Purpose after archive.
## Requirements
### Requirement: Expose book initialization API
The system SHALL provide a `POST /api/books` endpoint that accepts a repository URL or local path and initiates the `pyharness init` process.

#### Scenario: Successful initialization
- **WHEN** user sends `POST /api/books` with a valid `repo_path` payload
- **THEN** the system executes the python harness to generate the book YAML and returns the newly created book ID.

#### Scenario: Invalid repository
- **WHEN** user sends `POST /api/books` with an unreachable `repo_path`
- **THEN** the system returns a 400 Bad Request error with details.


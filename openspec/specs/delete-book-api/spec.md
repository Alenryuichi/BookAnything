# delete-book-api Specification

## Purpose
TBD - created by archiving change delete-book-feature. Update Purpose after archive.
## Requirements
### Requirement: Book Deletion API Endpoint
The system SHALL provide an API endpoint (`DELETE /api/books/[bookId]`) to orchestrate the complete deletion of a book.

#### Scenario: Active Job Cancellation
- **WHEN** the deletion endpoint is called while an analysis or generation job is running for the book.
- **THEN** the system MUST find and cancel the active job process before proceeding with file deletion.

#### Scenario: YAML Config Deletion
- **WHEN** the deletion endpoint is called.
- **THEN** the system MUST delete the `projects/<bookId>.yaml` file (or its resolved equivalent configuration file).

#### Scenario: Knowledge Directory Deletion
- **WHEN** the deletion endpoint is called.
- **THEN** the system MUST recursively delete the `knowledge/<dirName>` directory associated with the book.

#### Scenario: Managed Workspace Deletion
- **WHEN** the deletion endpoint is called.
- **THEN** the system MUST check if the repository path resides within the `workspaces/` directory. If it does, the system MUST delete the repository folder. If the repository is a local path outside `workspaces/`, the system MUST NOT delete it.

#### Scenario: Index Rebuild
- **WHEN** all files have been deleted successfully.
- **THEN** the system MUST trigger the `scripts/rebuild-index.sh` shell script and invalidate the index cache.


## ADDED Requirements

### Requirement: Book creation wizard page
The system SHALL provide a `/books/new` UI wizard that prompts the user for a repository URL and submits it to the creation API.

#### Scenario: Submitting a valid repository
- **WHEN** the user enters a repo path in `/books/new` and clicks "Create Book"
- **THEN** the UI shows a loading state, calls `POST /api/books`, and redirects to the book's page upon success.

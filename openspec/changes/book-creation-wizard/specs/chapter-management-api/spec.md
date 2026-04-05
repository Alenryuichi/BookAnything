## ADDED Requirements

### Requirement: Expose chapter rewrite and deletion APIs
The system SHALL provide endpoints `PUT /api/books/[id]/chapters/[cid]` to trigger a chapter rewrite, and `DELETE /api/books/[id]/chapters/[cid]` to remove a chapter JSON.

#### Scenario: Rewrite a chapter
- **WHEN** a `PUT` request is sent to a specific chapter endpoint
- **THEN** the system spawns the python harness to rewrite only that chapter and returns the updated JSON content.

#### Scenario: Delete a chapter
- **WHEN** a `DELETE` request is sent to a specific chapter endpoint
- **THEN** the system removes the corresponding JSON file and updates the book index.

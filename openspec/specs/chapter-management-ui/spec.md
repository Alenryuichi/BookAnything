# chapter-management-ui Specification

## Purpose
TBD - created by archiving change book-creation-wizard. Update Purpose after archive.
## Requirements
### Requirement: Chapter management buttons
The system SHALL display "Rewrite" and "Delete" actions on the chapter reading interface for the currently active chapter.

#### Scenario: User clicks Rewrite
- **WHEN** the user clicks "Rewrite" while viewing a chapter
- **THEN** the UI indicates a loading/generation state, calls the `PUT` chapter API, and refreshes the chapter content upon completion.


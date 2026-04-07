## ADDED Requirements

### Requirement: Chapter outline artifact is available to downstream consumers
The system SHALL persist chapter planning results to `knowledge/chapter-outline.json`, and downstream loaders MUST expose the parsed outline data when that artifact exists.

#### Scenario: Outline file exists
- **WHEN** a book knowledge directory contains a valid `chapter-outline.json`
- **THEN** downstream callers receive both the existing knowledge payload and the parsed outline structure

#### Scenario: Outline file missing
- **WHEN** an older book knowledge directory does not contain `chapter-outline.json`
- **THEN** downstream callers still receive the rest of the knowledge payload with an empty or null outline value

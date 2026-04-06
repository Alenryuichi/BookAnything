## ADDED Requirements

### Requirement: Book overview displays coverage dashboard
The book overview page (`/books/[bookId]`) SHALL display a coverage dashboard when a `chapter-outline.json` is present. This dashboard MUST calculate and display the percentage of semantic nodes covered by the chapters, and list the IDs/names of up to 5 critical uncovered nodes.

#### Scenario: Outline is present
- **WHEN** a user views a book overview and the outline data is loaded
- **THEN** a progress bar showing the graph coverage percentage is displayed above the chapter list

#### Scenario: Outline is missing
- **WHEN** a user views a book overview but no outline data exists
- **THEN** the coverage dashboard is safely omitted without breaking the page

### Requirement: Chapter items display coverage count
Each chapter item in the overview list SHALL display the number of semantic concepts it covers (`kg_coverage` length), provided the outline data is available.

#### Scenario: Chapter covers multiple concepts
- **WHEN** a chapter's outline data lists 3 nodes in `kg_coverage`
- **THEN** the chapter item UI displays a badge or text indicating "Covers 3 concepts"

## Why

While the backend now generates a rich semantic knowledge graph and a coverage-aware chapter outline, the frontend UI remains blind to this data. Users cannot see what percentage of the codebase's core concepts are covered by the generated chapters, nor can they visually distinguish covered vs. uncovered nodes in the graph view. Exposing this coverage data bridges the "Knowledge Gap" and makes the graph-driven planning actually visible to the user.

## What Changes

- Add a "Coverage Dashboard" component to the book overview page (`/books/[bookId]`) showing the percentage of semantic nodes covered and listing key uncovered concepts.
- Enhance the Chapter list UI to show the `kg_coverage` (number of linked concepts) beneath each chapter.
- Add a "Coverage Filter" to the Knowledge Graph Explore page (`/books/[bookId]/explore`) to visually highlight covered nodes (green) vs. uncovered nodes (red/faded).
- Update the `/api/books/[bookId]/graph-data` endpoint to include coverage flags for nodes based on `chapter-outline.json`.

## Capabilities

### New Capabilities

- `graph-coverage-ui`: Visual components for displaying knowledge graph coverage metrics and filtering graph nodes by coverage status.

### Modified Capabilities

- `chapter-management-ui`: The book overview and chapter lists must display coverage metadata derived from the `outline` object.
- `book-creation-api`: The graph data endpoint must merge outline coverage metadata into the node payload it serves to the frontend.

## Impact

- `web-app/app/api/books/[bookId]/graph-data/route.ts` (API payload extension)
- `web-app/app/books/[bookId]/page.tsx` (Overview layout changes)
- `web-app/components/KnowledgeGraph/GraphCanvas.tsx` & `GraphToolbar.tsx` (Node styling and filter controls)
- New React components for coverage progress bars and lists.

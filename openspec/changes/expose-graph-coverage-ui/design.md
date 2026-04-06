## Context

The backend now generates a `chapter-outline.json` that includes `uncovered_nodes` and per-chapter `kg_coverage`. The `loadKnowledge` helper exposes this to the Next.js app. However, the UI still renders as if this data doesn't exist: the overview page lacks coverage metrics, and the graph visualization treats all nodes equally.

## Goals / Non-Goals

**Goals:**
- Expose a high-level graph coverage progress bar and missing concepts list on the overview page.
- Annotate the chapter list with coverage summaries.
- Add a filter toggle to the Knowledge Graph visualization to highlight covered vs. uncovered nodes.
- Pass node coverage state safely through the `/api/books/[bookId]/graph-data` endpoint.

**Non-Goals:**
- Allowing users to interactively drag/drop nodes to reassign coverage (read-only for now).
- Changing the backend planning algorithm.
- Supporting real-time streaming updates of coverage *during* generation (static load is sufficient).

## Decisions

### Decision 1: Graph Data API Payload Extension

The `/api/books/[bookId]/graph-data` endpoint will add an `isCovered: boolean` flag to each node it returns. It determines this by reading `knowledge.outline.uncovered_nodes`. If the outline doesn't exist, it defaults to true (or omits the flag) so older books don't look broken.

Why this approach:
- Keeps the heavy data processing server-side.
- The React Flow canvas component only needs to react to a boolean flag for styling.

### Decision 2: React Flow Node Styling for Coverage

We will add a new prop to the custom React Flow node component (`ModuleNode.tsx` or similar) to accept the `isCovered` flag. We'll introduce a "Coverage Mode" toggle in the `GraphToolbar`. When toggled:
- `isCovered === false` nodes get a red/warning border.
- `isCovered === true` nodes get a green border or remain default.
- Unrelated/filtering modes fade out non-matching nodes.

Why this approach:
- Minimal changes to the existing graph rendering engine.
- Provides immediate visual feedback of the "Knowledge Gap".

### Decision 3: Overview Page Coverage Dashboard

We will inject a new `<CoverageDashboard outline={knowledge.outline} stats={knowledge.stats} />` component between the stats row and the chapter list on `/books/[bookId]/page.tsx`. It will calculate `total_semantic_nodes = covered_nodes + uncovered_nodes` and render a progress bar. If no outline is present, it returns null.

Why this approach:
- Gracefully degrades for old books.
- Gives users immediate feedback on the quality of the generated outline before they even dive into the graph.

## Risks / Trade-offs

- [Risk] If `uncovered_nodes` contains nodes that were filtered out of the API payload, calculations might look weird. -> Mitigation: Only calculate percentage based on nodes that actually exist in the `modules`/`relationships` data.

## Migration Plan

- No data migration needed. Books without `chapter-outline.json` simply won't show the new UI components.

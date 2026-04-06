## 1. Graph Data API Extension

- [x] 1.1 Update `web-app/app/api/books/[bookId]/graph-data/route.ts` to read `knowledge.outline.uncovered_nodes`
- [x] 1.2 Append `isCovered: boolean` to each node in the `/graph-data` API response based on the uncovered list

## 2. Graph Coverage Visuals

- [x] 2.1 Update `ModuleNode.tsx` (or equivalent graph node component) to accept and display `isCovered` styling (e.g. red border for missing)
- [x] 2.2 Add a Coverage Filter toggle (All / Covered / Uncovered) to `GraphToolbar.tsx`
- [x] 2.3 Wire the coverage filter into `KnowledgeGraphPage.tsx` state and pass faded/hidden visibility flags down to React Flow

## 3. Overview Page Dashboard

- [x] 3.1 Create a new `<CoverageDashboard>` component to render a progress bar and list of missing concepts
- [x] 3.2 Update `web-app/app/books/[bookId]/page.tsx` to insert the coverage dashboard above the chapter list when an outline exists
- [x] 3.3 Update the chapter list items in `page.tsx` to show the number of covered concepts beneath the chapter title

## 4. Verification

- [x] 4.1 Verify `/api/books/[bookId]/graph-data` includes `isCovered` flags
- [x] 4.2 Open a book overview and confirm the progress bar and chapter badges render correctly
- [x] 4.3 Open the graph explorer, toggle the Coverage Filter, and verify uncovered nodes are visually distinguishable

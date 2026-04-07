## 1. useAnalyzeProgress Hook

- [x] 1.1 Create `web-app/components/KnowledgeGraph/hooks/useAnalyzeProgress.ts` with TypeScript interfaces for analyze phase state (stage enum, batch progress, error)
- [x] 1.2 Implement EventSource connection to `/api/jobs/{jobId}/stream` with auto-reconnect and `Last-Event-ID` resume
- [x] 1.3 Parse SSE `log` events: map `analyze_*` event types to the 5-stage model (scanning → analyzing → merging → tours → finalizing)
- [x] 1.4 Compute weighted overall progress: scanning 10%, analyzing 60% (with batch sub-progress), merging 15%, tours 10%, finalizing 5%
- [x] 1.5 Handle terminal events (`done` / `error`): set completion or error state, close EventSource
- [x] 1.6 Expose cleanup on unmount (close EventSource, clear state)

## 2. AnalyzeProgress Component

- [x] 2.1 Create `web-app/components/KnowledgeGraph/AnalyzeProgress.tsx` with props: `bookId`, `jobId`, `onComplete` callback
- [x] 2.2 Render 5-step vertical timeline with status indicators (pending/active/complete icons per step)
- [x] 2.3 Render overall progress bar using the weighted percentage from useAnalyzeProgress
- [x] 2.4 Display batch progress detail during "Analyzing code" phase ("Batch 3 / 10")
- [x] 2.5 Show file scan statistics when available (e.g., "Found 142 files, skipped 38")
- [x] 2.6 On error: display error message and "Retry" button that calls `POST /api/books/{bookId}/analyze` to start a new job
- [x] 2.7 On complete: show "Analysis complete!" for 1s then call `onComplete`

## 3. EmptyState Rewrite + Active Job Detection

- [x] 3.1 Modify `useKnowledgeGraph` hook: when fetch returns 404, check `GET /api/books/{bookId}/active-job` — if 200, set a new `activeJobId` state
- [x] 3.2 Expose `activeJobId` and `refetch()` function from `useKnowledgeGraph` hook
- [x] 3.3 Rewrite `EmptyState` in `KnowledgeGraphPage.tsx`: remove the polling logic, only render the "Generate" button and "Back" link
- [x] 3.4 Add state management in `KnowledgeGraphPage`: if `activeJobId` exists or user clicks Generate, render `AnalyzeProgress` instead of `EmptyState`
- [x] 3.5 Wire `AnalyzeProgress.onComplete` to call `refetch()` from useKnowledgeGraph for seamless transition

## 4. Integration & Testing

- [x] 4.1 Verify TypeScript compilation passes with no errors
- [x] 4.2 Test flow: click Generate → see progress → completion auto-transitions to graph
- [x] 4.3 Test flow: navigate to /explore while analysis is running → progress view appears automatically
- [x] 4.4 Test flow: analysis fails → error displayed with Retry button → retry starts new job
- [x] 4.5 Test flow: refresh page during analysis → active job detected → progress view resumes

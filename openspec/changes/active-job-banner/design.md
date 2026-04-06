## Context

The BookAnything web app spawns `pyharness` generation jobs from a book detail page. When a user clicks "Start Generation", the job starts and the browser navigates to a dashboard page with `?jobId=<uuid>` in the URL. If the user navigates away, the jobId is lost — returning to the book detail page shows no sign of the running job.

Currently, duplicate detection in the generate route (`POST /api/books/{bookId}/generate`) uses a fragile heuristic: scanning each active job's log entries for a string matching the bookId. This is unreliable because early log entries may not yet contain the bookId.

The job manager (`JobManagerSingleton`) stores jobs in an in-process `Map`, persisted across HMR via `globalThis`. There is no persistent database — all state is ephemeral per server process.

## Goals / Non-Goals

**Goals:**
- Users can navigate away from the dashboard and return to see an active job from the book detail page.
- The "Start Generation" button is replaced by a live status banner when a job is already running.
- Duplicate job detection is reliable (structural, not heuristic).
- Zero new external dependencies.

**Non-Goals:**
- Persisting job state across server restarts (this is a future concern for a database-backed queue).
- Showing generation history (past completed/failed jobs) — only active jobs are surfaced.
- Adding SSE or WebSocket to the book detail page — simple polling is sufficient for a banner.

## Decisions

### 1. Add `bookId` to Job interface (structural association)

**Decision**: Add an optional `bookId?: string` field to the `Job` interface. The `spawn()` method accepts `bookId` via a new options field. `findActiveByBook(bookId)` iterates the job map and returns the first active job matching that bookId.

**Why not a separate bookId→jobId index?** The job map is small (MAX_ACTIVE_JOBS=10). A linear scan is trivial and avoids stale index bugs when jobs are evicted.

**Why optional?** Not all jobs are book-related (e.g., the `POST /api/books` init job). Making it optional preserves backward compatibility.

### 2. Polling from the client, not SSE

**Decision**: `StartGenerationButton` polls `GET /api/books/{bookId}/active-job` every 3 seconds to detect active jobs, rather than opening an SSE connection.

**Why?** The book detail page is a server component. Only `StartGenerationButton` is a client component. A 3-second poll for a single lightweight JSON response is negligible overhead and far simpler than wiring SSE into a component that primarily exists to show a button. The dashboard already uses SSE for high-frequency log streaming — no need to duplicate that here.

### 3. Active-job API returns minimal payload

**Decision**: The new `GET /api/books/{bookId}/active-job` endpoint returns `{ jobId, state, progress }` (or 404). It does not stream logs.

**Why?** The banner only needs to show "Generation running — 42% — View Dashboard". Full logs are available on the dashboard page.

### 4. Banner replaces button, no modal

**Decision**: When an active job is detected, the "Start Generation" button is replaced in-place by a status banner with a progress indicator and a "View Dashboard" link. No modal or toast.

**Why?** A persistent banner in the natural button location is the most discoverable UX. Modals are disruptive; toasts are ephemeral and easily missed.

## Risks / Trade-offs

- **[Ephemeral state]** If the Next.js server restarts, all job references are lost. The banner will disappear even if the `pyharness` process is still running. → Mitigation: This is a pre-existing limitation of the in-process job manager. A future database-backed queue will address it.
- **[Polling delay]** Up to 3 seconds before the banner appears on page load. → Mitigation: The button is disabled immediately on click (existing behavior) and the page redirects to dashboard. The poll only matters for returning visits.
- **[Single active job per book]** `findActiveByBook` returns the first match. If a second job is somehow started (race condition, direct API call), only one is surfaced. → Mitigation: The generate route already checks for active jobs before spawning. With structural bookId matching, this is more reliable than before.

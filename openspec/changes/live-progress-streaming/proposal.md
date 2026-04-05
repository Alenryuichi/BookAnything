## Why

Book creation (`POST /api/books`) currently blocks the HTTP response for 30–60 seconds while cloning + running `pyharness init`. During that time the frontend shows **fake simulated logs** via `TerminalLoader` — the user has zero visibility into what's actually happening, cannot detect errors early, and has no way to know if the process stalled. This is Phase 3 of the ROADMAP ("Live Generation Engine") and the #1 UX gap remaining after Phase 2.

## What Changes

- **Backend job runner**: `POST /api/books` returns immediately with a `jobId`. A background process spawns `pyharness init` (and later `pyharness run`) asynchronously, capturing its stdout/stderr in real time.
- **Structured log emitter**: `pyharness/log.py` gains a JSON-lines sidecar output (file or FIFO) so the web layer can stream structured events (`{level, message, timestamp, phase, progress}`).
- **SSE streaming endpoint**: New `GET /api/jobs/[jobId]/stream` route pushes real-time log lines and progress percentage to the browser via Server-Sent Events.
- **Job status endpoint**: New `GET /api/jobs/[jobId]` returns current job state (`queued | running | done | failed`) plus accumulated logs, so the UI can recover if the SSE connection drops.
- **Frontend real-time consumer**: `TerminalLoader` replaces its fake log array with an `EventSource` subscription, rendering real backend output and real progress.

## Capabilities

### New Capabilities
- `job-queue`: Background job lifecycle management — spawn, track, cancel async `pyharness` processes. Provides job state persistence and process supervision.
- `sse-progress-stream`: Server-Sent Events transport layer for streaming structured log events and progress data from backend jobs to the browser in real time.

### Modified Capabilities
- `book-creation-api`: The `POST /api/books` route changes from a synchronous blocking call to an async job dispatch that returns a `jobId`. Response shape changes (**BREAKING** for current callers).
- `book-creation-ui`: The creation page switches from simulated fake logs to a real SSE-backed terminal stream, requiring the `TerminalLoader` to accept a `jobId` prop and manage an `EventSource` connection.

## Impact

- **`pyharness/log.py`** — Add structured JSON-lines output alongside existing pretty-print console logging.
- **`web-app/app/api/books/route.ts`** — Refactor `POST` handler to return `jobId` immediately; move clone + init logic into job runner.
- **`web-app/app/api/jobs/` (new)** — Two new API routes: `[jobId]/route.ts` (status polling) and `[jobId]/stream/route.ts` (SSE).
- **`web-app/lib/job-manager.ts` (new)** — In-process job registry: spawn child processes, capture output, track state.
- **`web-app/components/TerminalLoader.tsx`** — Replace simulated logs/progress with real `EventSource` consumption.
- **`web-app/app/books/new/page.tsx`** — Pass `jobId` to `TerminalLoader` after POST returns.
- **`web-app/e2e/wizard.spec.ts`** — Update tests for the new async flow.
- **Dependencies**: No new npm/pip packages required; Node.js `child_process` + native `ReadableStream` for SSE, Python `json` for structured logs.

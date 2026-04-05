## Context

BookAnything currently handles book creation via a synchronous `POST /api/books` endpoint that blocks for 30–60 seconds while cloning a repository and running `pyharness init`. The frontend shows a `TerminalLoader` component with hardcoded fake log messages and an asymptotic progress bar — no real backend data reaches the user.

The Python harness (`pyharness/log.py`) writes structured logs to both stdout (with ANSI colors) and a flat text file (`output/logs/harness.log`), but has no machine-readable streaming output that a web layer could consume.

The Next.js web app runs in SSR mode (not static export), so it can host long-lived SSE connections.

## Goals / Non-Goals

**Goals:**
- `POST /api/books` returns within 200ms with a `jobId` — the heavy work runs in the background.
- The browser receives real `pyharness` log lines within 500ms of them being emitted.
- If the SSE connection drops, the UI can reconnect and catch up on missed logs via a polling endpoint.
- The same job infrastructure can later support `pyharness run` (full generation loop) without architectural changes.

**Non-Goals:**
- Multi-node job distribution (Redis, BullMQ) — single-process in-memory is sufficient at current scale.
- Authentication / multi-tenant job isolation — no auth exists yet (Phase 5).
- WebSocket transport — SSE is simpler, unidirectional (server→client) is all we need, and works through most proxies.
- Persistent job history beyond process lifetime — jobs live in memory; on restart they're gone.

## Decisions

### D1: In-process job registry (Map) vs. external queue (Redis/BullMQ)

**Choice**: In-process `Map<string, Job>` in `web-app/lib/job-manager.ts`.

**Rationale**: The app currently serves a single user on localhost. Adding Redis introduces infra complexity (install, connect, error handling) with zero benefit at this scale. The `Map` approach is ~50 lines of code, zero dependencies, and trivially replaceable later when we add persistence (Phase 5).

**Alternative rejected**: BullMQ — production-grade but requires Redis, adds 2 dependencies, and complicates the dev setup for a local-first tool.

### D2: Structured JSON-lines log output vs. parsing ANSI stdout

**Choice**: Dual-write in `pyharness/log.py` — keep existing pretty-print to stdout, add a JSON-lines file at a path passed via `--log-sink <path>` CLI arg.

**Rationale**: Parsing ANSI-escaped stdout is fragile and loses semantic information (level, phase, progress %). A JSON-lines sidecar (`{ts, level, msg, phase?, progress?}`) is trivial to parse and forward. The file-based approach (not a socket) avoids cross-process networking complexity and works on all OSes.

**Alternative rejected**: Structured stdout (replacing ANSI) — would break human-readable CLI experience. Pipe/FIFO — platform-dependent, harder to debug.

### D3: SSE via Next.js Route Handler `ReadableStream` vs. Express middleware

**Choice**: Native Next.js App Router route handler returning a `ReadableStream` with `text/event-stream` content type at `GET /api/jobs/[jobId]/stream`.

**Rationale**: Next.js 14+ route handlers support streaming responses natively. No additional server or middleware needed. The route tails the job's log sink file using an interval-based reader (like `tail -f`) and pushes new lines as SSE events.

**Alternative rejected**: Separate Express sidecar — adds a second server process, CORS config, and port management.

### D4: Progress calculation — harness-reported vs. heuristic

**Choice**: Hybrid. `pyharness init` emits explicit `progress` fields at known milestones (clone: 10%, scan: 40%, plan: 70%, yaml: 90%, done: 100%). Between milestones, the frontend interpolates linearly based on time.

**Rationale**: The init process has well-defined phases; we can instrument each one. For `pyharness run` (multi-iteration), progress is `iteration / max_iterations` which is naturally available.

### D5: Job ID format

**Choice**: `crypto.randomUUID()` — native in Node 19+, zero dependencies.

## Risks / Trade-offs

- **[Memory leak if jobs accumulate]** → Mitigation: Auto-evict completed/failed jobs after 30 minutes via a `setTimeout` cleanup. Cap active jobs at 10.
- **[SSE connection limit per browser]** → Mitigation: Only one active SSE per job page. HTTP/2 multiplexing avoids the 6-connection limit.
- **[Log file grows unbounded for long runs]** → Mitigation: Log sink file is per-job, deleted on eviction. For `pyharness run` (hours-long), rotate or truncate after 10k lines.
- **[Next.js dev mode hot-reload kills in-flight SSE]** → Mitigation: Frontend `EventSource` auto-reconnects with `lastEventId`. This is acceptable for dev; production builds are stable.
- **[Child process orphaning on server crash]** → Mitigation: Spawn with `detached: false` (default). Register `SIGTERM` handler to kill children. Not bulletproof, but sufficient for local use.

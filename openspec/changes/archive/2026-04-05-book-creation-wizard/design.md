## Context

The BookAnything system currently relies on the CLI (`python3 -m pyharness run`) to manage the entire book lifecycle. This is powerful but limits accessibility. As we move towards a platform model (Phase 2 & 3), we need to allow users to create new books and manage existing chapters directly from the Next.js Web App without touching the terminal.

## Goals / Non-Goals

**Goals:**
- Provide a `POST /api/books` endpoint to trigger repository scanning.
- Provide a `/books/new` wizard UI to guide users through the creation process.
- Provide chapter-level management APIs (`PUT /api/books/[id]/chapters/[cid]`) to rewrite individual chapters.
- Integrate Rewrite/Delete buttons into the chapter reading UI.

**Non-Goals:**
- Real-time SSE/WebSocket progress tracking for the entire book generation loop (this is Phase 3).
- Multi-user authentication and permissions (this is Phase 5).

## Decisions

- **Node.js to Python Bridge:** The Next.js API routes will use `child_process.exec` (or `spawn`) to invoke the `pyharness` CLI for `init` and single-chapter `write` commands.
  - *Alternative:* Rewrite the Python harness in Node.js. *Rationale against:* We just invested in migrating to a stable Python SDK. Using CLI bindings is practical for the current architecture.
- **Synchronous API for `init`:** The `pyharness init` command is generally fast enough (just scanning the repo and generating YAML via Claude). We will keep `POST /api/books` synchronous for simplicity.
- **Single Chapter Rewrite:** We will implement a `pyharness write --chapter <cid>` target in the Python CLI and expose it via the `PUT` API.

## Risks / Trade-offs

- **[Risk] Long-running API requests timeout**
  - *Mitigation:* `pyharness init` usually finishes within 30-60 seconds. We may need to configure Next.js API timeouts or Vercel maxDuration if deployed.
- **[Risk] Concurrent CLI executions causing state corruption**
  - *Mitigation:* The Python state manager already uses atomic writes. For Phase 2, we assume a single-tenant or low-concurrency environment.

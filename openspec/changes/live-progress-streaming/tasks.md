## 1. Python Harness — Structured Log Sink

- [x] 1.1 Add \`--log-sink <path>\` CLI argument to \`pyharness/__main__.py\` for \`init\` and \`run\` subcommands
- [x] 1.2 Extend \`pyharness/log.py\`: \`init_log()\` accepts optional \`sink_path\`; \`log()\` appends JSON-lines \`{"ts","level","msg"}\` to sink file when configured
- [x] 1.3 Instrument \`pyharness/init.py\` with progress milestones: clone=10%, scan=40%, plan=70%, yaml=90%, done=100%
- [x] 1.4 Unit test: verify JSON-lines output is valid JSON, one object per line, with correct fields

## 2. Job Manager — Backend In-Process Registry

- [x] 2.1 Create \`web-app/lib/job-manager.ts\` with \`Job\` type (\`id, state, startedAt, logs[], progress, exitCode?\`) and \`JobManager\` singleton class
- [x] 2.2 Implement \`JobManager.spawn(command, cwd)\` — creates job, spawns child process via \`child_process.spawn\`, captures stdout/stderr line-by-line, parses JSON-lines into \`logs[]\`
- [x] 2.3 Implement \`JobManager.get(jobId)\` — returns job snapshot or \`null\`
- [x] 2.4 Implement \`JobManager.subscribe(jobId, callback)\` — push new log lines to subscribers (for SSE)
- [x] 2.5 Implement auto-eviction: \`setTimeout\` to delete completed/failed jobs after 30 minutes, cap active jobs at 10 (reject with descriptive error)
- [x] 2.6 Register \`SIGTERM\`/\`SIGINT\` handler to kill all child processes on server shutdown

## 3. API Routes — Job Status & SSE Streaming

- [x] 3.1 Create \`web-app/app/api/jobs/[jobId]/route.ts\` — \`GET\` returns job state JSON (id, state, logs, progress, exitCode)
- [x] 3.2 Create \`web-app/app/api/jobs/[jobId]/stream/route.ts\` — \`GET\` returns \`text/event-stream\` response using \`ReadableStream\`; replays accumulated logs, then pushes live events with monotonic \`id\` field
- [x] 3.3 Handle \`Last-Event-ID\` header for reconnection: skip already-delivered events
- [x] 3.4 Emit terminal \`event: done\` or \`event: error\` SSE event when job finishes, then close stream

## 4. Refactor Book Creation API — Async Dispatch

- [x] 4.1 Refactor \`POST /api/books\` in \`web-app/app/api/books/route.ts\`: validate \`repo_path\`, call \`JobManager.spawn()\` with the appropriate \`pyharness init\` command (including \`--log-sink\`), return \`202 { jobId }\` immediately
- [x] 4.2 Move git clone logic into the job command string or a wrapper script so it runs inside the spawned process
- [x] 4.3 After job completion: run \`rebuild-index.sh\` and invalidate index cache (hook into job completion callback)

## 5. Frontend — Real-Time Terminal Loader

- [x] 5.1 Update \`web-app/components/TerminalLoader.tsx\`: accept \`jobId\` prop, replace fake logs with \`EventSource\` connected to \`/api/jobs/{jobId}/stream\`
- [x] 5.2 Parse incoming SSE \`data:\` payloads as JSON, append \`message\` to log display, update progress bar from \`progress\` field
- [x] 5.3 Handle \`event: done\` — set progress to 100%, show success state
- [x] 5.4 Handle \`event: error\` — show error in terminal, turn progress bar red, display "Retry" button
- [x] 5.5 Handle SSE reconnection: track \`lastEventId\` to avoid duplicate log lines on reconnect
- [x] 5.6 Graceful fallback: if \`jobId\` is not provided, keep existing simulated logs behavior (backward compatible)

## 6. Wire Up New Book Page

- [x] 6.1 Update \`web-app/app/books/new/page.tsx\`: after \`POST /api/books\` returns \`{ jobId }\`, pass \`jobId\` to \`TerminalLoader\`
- [x] 6.2 On job \`done\` event: fetch updated book list, identify the new book, redirect to its page
- [x] 6.3 On job \`error\` event: show error details and a "Retry" button that resets the form

## 7. Testing & Verification

- [x] 7.1 Update \`web-app/e2e/wizard.spec.ts\` to handle the new async flow: expect \`202\` from POST, mock or wait for SSE completion
- [x] 7.2 Integration test: \`POST /api/books\` returns \`jobId\`, \`GET /api/jobs/{jobId}\` returns valid state
- [ ] 7.3 Manual smoke test: create a book from a real repo URL, verify real logs appear in terminal, progress reaches 100%, redirect works
- [x] 7.4 \`npm run build\` passes without errors

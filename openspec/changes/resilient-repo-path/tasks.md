## 1. Backend: resolve_repo_path

- [x] 1.1 Create `pyharness/repo.py` with `RepoNotFoundError` exception class
- [x] 1.2 Implement `resolve_repo_path(repo_path, remote_url, base_dir)` — relative→absolute, exists check, auto clone
- [x] 1.3 Add `remote_url: str | None` optional field to project config Pydantic model in `pyharness/config.py`
- [x] 1.4 Update `HarnessRunner.__init__` to call `resolve_repo_path` instead of using `config.repo_path` directly
- [x] 1.5 Update `step_analyze` in `pyharness/phases/analyze.py` to call `resolve_repo_path`
- [x] 1.6 Unit test: relative path resolution, absolute path passthrough, missing with remote_url triggers clone (mock subprocess), missing without remote_url raises error

## 2. Backend: pyharness init improvements

- [x] 2.1 Add `--remote-url` CLI argument to `init` subcommand in `pyharness/__main__.py`
- [x] 2.2 Modify init YAML generation: write relative `repo_path` when repo is under harness root, absolute otherwise
- [x] 2.3 Write `remote_url` field to YAML when `--remote-url` is provided
- [x] 2.4 Unit test: init generates relative path for repos under harness root, absolute for external repos, remote_url field presence

## 3. Frontend: repo-status API

- [x] 3.1 Create `web-app/app/api/books/[bookId]/repo-status/route.ts` — parse YAML, resolve path, check exists, return status JSON
- [x] 3.2 Create `web-app/app/api/books/[bookId]/reclone/route.ts` — POST endpoint that runs `git clone <remote_url> <path>` via jobManager
- [x] 3.3 Update `web-app/app/api/books/route.ts` POST — pass `--remote-url` flag to `pyharness init` when source is a remote URL

## 4. Frontend: repo-missing UI

- [x] 4.1 Add `useRepoStatus` hook or inline fetch in KnowledgeGraphPage to check `/api/books/{bookId}/repo-status` before showing EmptyState
- [x] 4.2 Create `RepoMissing` component: shows path, remote URL, "Re-clone" button (if canReclone) or manual fix instructions
- [x] 4.3 Wire "Re-clone" button to POST `/api/books/{bookId}/reclone`, show progress, reload on success
- [x] 4.4 Integrate RepoMissing into KnowledgeGraphPage: show instead of EmptyState when repo unavailable

## 5. Integration & Testing

- [x] 5.1 TypeScript compilation check (tsc --noEmit)
- [x] 5.2 Python unit tests pass
- [x] 5.3 Playwright E2E: repo-status API returns correct JSON for existing and missing repos
- [x] 5.4 Playwright E2E: explore page shows RepoMissing UI when repo unavailable
- [x] 5.5 Existing smoke tests pass (no regression)

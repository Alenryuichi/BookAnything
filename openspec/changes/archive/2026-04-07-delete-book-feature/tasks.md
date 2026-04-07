## 1. Backend Implementation (Delete API)

- [x] 1.1 Create `web-app/app/api/books/[bookId]/route.ts` with a `DELETE` request handler.
- [x] 1.2 Implement job cancellation logic using `jobManager.findActiveByBook` and sending a "cancel" action via `jobManager.sendCommand`.
- [x] 1.3 Implement project YAML deletion using `findProjectYaml(bookId)` and `fs.unlinkSync`.
- [x] 1.4 Implement knowledge directory deletion using `resolveBookDir(bookId)` and `fs.rmSync`.
- [x] 1.5 Implement workspace directory deletion logic with safe boundary checking (must be inside `workspaces/`).
- [x] 1.6 Trigger index rebuild by running `scripts/rebuild-index.sh` and calling `invalidateIndexCache()`.

## 2. Frontend Component (DeleteBookButton)

- [x] 2.1 Create new Client Component `web-app/components/DeleteBookButton.tsx`.
- [x] 2.2 Implement native `window.confirm` dialog in the button's `onClick` handler.
- [x] 2.3 Implement the `fetch` call to `DELETE /api/books/[bookId]`.
- [x] 2.4 Add loading state management while the deletion is processing.
- [x] 2.5 Implement redirect to `/books` using `useRouter` on success.

## 3. UI Integration

- [x] 3.1 Import and add `DeleteBookButton` to `web-app/app/books/[bookId]/page.tsx` near the "Back to Bookshelf" link.
- [x] 3.2 Verify layout and hover styles.

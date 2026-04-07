## 1. Data Layer — Job ↔ Book Association

- [x] 1.1 Add optional `bookId?: string` field to the `Job` interface in `web-app/lib/job-manager.ts`
- [x] 1.2 Update `spawn()` to accept `bookId` via the options parameter and store it on the job record
- [x] 1.3 Implement `findActiveByBook(bookId: string): Job | null` method on `JobManagerSingleton`

## 2. API Layer — Active Job Query

- [x] 2.1 Create `web-app/app/api/books/[bookId]/active-job/route.ts` with `GET` handler returning `{ jobId, state, progress }` or 404
- [x] 2.2 Refactor `POST /api/books/[bookId]/generate/route.ts` to use `findActiveByBook(bookId)` for duplicate detection instead of log-content scan
- [x] 2.3 Pass `bookId` to `jobManager.spawn()` in the generate route
- [x] 2.4 Pass derived `bookId` to `jobManager.spawn()` in `POST /api/books/route.ts` (init job)

## 3. UI Layer — Status Banner

- [x] 3.1 Add polling logic to `StartGenerationButton` — call `GET /api/books/{bookId}/active-job` on mount and every 3s
- [x] 3.2 Render status banner (progress indicator + "View Dashboard" link) when an active job is detected
- [x] 3.3 Hide "Start Generation" button while banner is showing; revert to button when poll returns 404

## 4. Verification

- [x] 4.1 TypeScript compilation passes (`npx tsc --noEmit`)
- [x] 4.2 Manual test: start generation → navigate away → return to book page → verify banner appears with correct dashboard link

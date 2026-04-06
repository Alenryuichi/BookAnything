## Why

When a user clicks "Start Generation" on a book detail page, they are redirected to the Dashboard with the `jobId` in the URL. If they navigate away (to browse other books, read chapters, etc.), the `jobId` is lost. Returning to the book detail page shows only the static "Start Generation" button with no indication that a generation job is still running in the background. This leads to confusion ("did my job finish?") and risks accidentally spawning duplicate jobs.

## What Changes

- Add an explicit `bookId` field to the `Job` interface so jobs are linked to books at creation time, replacing the fragile log-content string search currently used for duplicate detection.
- Add a new lightweight API endpoint `GET /api/books/{bookId}/active-job` that returns the active job's id, state, and progress (or 404 if none).
- Replace the "Start Generation" button area on the book detail page with a live status banner when an active job exists, including a "View Dashboard" link that carries the correct `jobId`.
- Disable the "Start Generation" button while a job is active to prevent duplicates.

## Capabilities

### New Capabilities
- `active-job-query`: API and data model changes to associate jobs with books and query active jobs by bookId.
- `active-job-banner-ui`: Client-side component that polls for active jobs and renders a status banner with dashboard navigation.

### Modified Capabilities
- `book-creation-api`: The `POST /api/books` and `POST /api/books/{bookId}/generate` routes will pass `bookId` when spawning jobs, and use `findActiveByBook()` instead of log-content search for duplicate detection.

## Impact

- **`web-app/lib/job-manager.ts`**: `Job` interface gains `bookId?` field; `spawn()` accepts optional `bookId`; new `findActiveByBook()` method.
- **`web-app/app/api/books/[bookId]/active-job/route.ts`**: New API route.
- **`web-app/app/api/books/[bookId]/generate/route.ts`**: Refactored duplicate detection.
- **`web-app/app/api/books/route.ts`**: Pass bookId to spawn.
- **`web-app/components/StartGenerationButton.tsx`**: Polls active-job API, conditionally renders banner vs button.
- No database changes. No breaking API changes.

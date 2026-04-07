## Why

Currently, there is no way for a user to delete a book they have created in the BookAnything application. If a user creates a book for testing, or if a book's configuration is incorrect, they are forced to manually navigate the file system to delete the YAML configuration, the generated knowledge graph data, and the cloned workspace repository. This is a poor user experience and leaves orphaned data. We need a straightforward, safe way to completely delete a book and all its associated artifacts from the UI.

## What Changes

- Add a "Delete Book" button to the Book Overview page (`/books/[bookId]`).
- Add an optional "Delete" action to book cards on the Bookshelf page (`/books`).
- Implement a confirmation dialog to prevent accidental deletion, warning the user about the irreversible nature of the action.
- Introduce a new backend API endpoint (`DELETE /api/books/[bookId]`) that:
  - Cancels any active analysis or generation jobs for the book.
  - Deletes the project's YAML configuration file.
  - Recursively deletes the book's knowledge directory (`knowledge/<dirName>`).
  - Safely deletes the cloned repository in the `workspaces/` directory.
  - Triggers an index rebuild and cache invalidation.

## Capabilities

### New Capabilities
- `delete-book-api`: Backend endpoint and logic to safely clean up all book-related files (YAML, knowledge, workspace) and cancel active jobs.
- `delete-book-ui`: Frontend UI components (Delete button, confirmation dialog) to trigger the deletion process.

### Modified Capabilities

## Impact

- **Affected Code**: 
  - `web-app/app/api/books/[bookId]/route.ts` (New file)
  - `web-app/components/DeleteBookButton.tsx` (New file)
  - `web-app/app/books/[bookId]/page.tsx`
  - `web-app/app/books/page.tsx`
- **APIs**: Introduces a new `DELETE` method for the `/api/books/[bookId]` route.
- **Dependencies**: No new external dependencies required (using native `window.confirm` or existing UI components like `shadcn/ui` `AlertDialog` if available).
- **Systems**: File system operations (`fs.rmSync`, `fs.unlinkSync`), process management (canceling active jobs), and the `scripts/rebuild-index.sh` shell script.

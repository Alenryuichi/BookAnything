## Context

Currently, books are created using the `pyharness init` command (via the frontend wizard). This process generates a YAML configuration in `projects/`, clones the source code repository to `workspaces/`, and generates various knowledge graph artifacts in `knowledge/`. There is no built-in cleanup mechanism. Users who want to delete a book must manually remove files across these three directories, which is error-prone and tedious. The goal is to provide a single, atomic API endpoint and a clean UI interaction to perform this deletion safely.

## Goals / Non-Goals

**Goals:**
- Provide a `DELETE /api/books/[bookId]` endpoint to completely remove all traces of a book.
- Delete the book's YAML config (`projects/<bookId>.yaml` or equivalent).
- Delete the book's knowledge artifacts (`knowledge/<dirName>`).
- Safely delete the cloned workspace (`workspaces/<repoName>`) ONLY IF it is located inside the `workspaces/` directory (to avoid deleting user source code located elsewhere on their system).
- Cancel any running jobs (analysis or generation) for the book before deletion.
- Provide a `DeleteBookButton` component with a confirmation dialog.

**Non-Goals:**
- We will NOT support restoring deleted books (no "Trash" or "Recycle Bin").
- We will NOT attempt to delete repositories that are outside the managed `workspaces/` directory, as they belong to the user.

## Decisions

**1. Job Cancellation Before Deletion**
- *Decision*: Before attempting file deletion, the API must query `jobManager.findActiveByBook(bookId)` and send a cancel signal or kill the process. 
- *Rationale*: If a job is actively writing to `knowledge/` or `output/logs/`, deleting the directory could cause the process to crash or recreate files after deletion.

**2. Safe Workspace Deletion**
- *Decision*: We will resolve the repository path from the YAML file. We will verify that the resolved path is a child of the `workspaces/` directory using standard path resolution. If it is, we will use `fs.rmSync(path, { recursive: true, force: true })`. If not, we will leave the repository alone.
- *Rationale*: Protects against the destructive deletion of a user's original source code if they used a local path during book creation.

**3. UI Placement**
- *Decision*: Place the "Delete Book" button on the book overview page (`/books/[bookId]`) near the "Back to Bookshelf" link, using a ghost button variant that highlights red on hover.
- *Rationale*: Keeps the destructive action accessible but out of the primary click path (e.g., away from the Start Generation button).

**4. Cache Invalidation**
- *Decision*: After successful deletion, the backend will call `scripts/rebuild-index.sh` and `invalidateIndexCache()`. The frontend will redirect to `/books` using `router.push('/books')` and `router.refresh()`.
- *Rationale*: Ensures the UI immediately reflects the removal of the book without requiring a manual page reload.

## Risks / Trade-offs

- **Risk: Deleting user files outside the workspace.**
  - *Mitigation*: Implement strict path checking. The workspace path must start with the absolute path of the `workspaces/` directory.
- **Risk: Locked files on Windows (if supported in future) causing deletion to fail.**
  - *Mitigation*: Handle `fs.rmSync` exceptions gracefully and return a 500 error detailing which files couldn't be deleted, so the user knows the deletion was partial.
- **Risk: Active background processes locking files.**
  - *Mitigation*: Actively find and kill jobs via `jobManager` before initiating file deletion.
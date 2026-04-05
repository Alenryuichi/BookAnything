## Why

The system currently relies entirely on the CLI (`python3 -m pyharness run`) to create and generate books. There is no way for a user to initiate the creation of a new book or manage existing books (like rewriting a chapter) directly from the Next.js web interface. To move towards a "Platform" phase, we need a dynamic Book Management layer (Phase 2) that allows users to seamlessly create and iterate on books via the browser.

## What Changes

- Add a new API route `POST /api/books` to accept a repository path/URL, which delegates to the Python `pyharness init` logic.
- Add a Web UI wizard (`/books/new`) to guide users through creating a new book, showing the generated chapter plan, and confirming creation.
- Add Chapter Management APIs (e.g. `PUT`, `DELETE` for chapters) to support on-demand single-chapter rewriting and deletion.
- Update the Web UI to include a "Rewrite" and "Delete" button on the chapter reading page.

## Capabilities

### New Capabilities
- `book-creation-api`: API endpoint `POST /api/books` that acts as a bridge to the Python harness for repository scanning and YAML generation.
- `book-creation-ui`: A wizard-style React page at `/books/new` for submitting repositories and reviewing the AI-generated book plan.
- `chapter-management-api`: API endpoints for managing individual chapters (`PUT` to rewrite, `DELETE` to remove).
- `chapter-management-ui`: UI components for chapter operations (Rewrite, Delete) integrated into the chapter reading interface.

### Modified Capabilities
- `knowledge-loader`: May require minor updates to support real-time reloading of chapters after a rewrite operation.

## Impact

- **Next.js Web App**: Significant additions to `app/api/` and `app/books/`.
- **Python Harness**: Must ensure the CLI commands (like `init` and single-chapter `write`) can be safely invoked via `subprocess` from the Node.js backend.
- **File System**: Concurrent access to `knowledge/` and `projects/` might occur; the Web App needs to handle loading states gracefully when the harness is modifying files.

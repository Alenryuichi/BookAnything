## ADDED Requirements

### Requirement: Book Overview Deletion UI
The Book Overview page (`/books/[bookId]`) SHALL include a UI control for deleting the current book.

#### Scenario: Delete Button Visibility
- **WHEN** a user visits the book overview page.
- **THEN** a "Delete Book" button MUST be visible near the "Back to Bookshelf" link, styled distinctly as a destructive action.

#### Scenario: Confirmation Dialog
- **WHEN** the user clicks the "Delete Book" button.
- **THEN** a confirmation dialog MUST appear, warning that the action is irreversible and detailing the data that will be destroyed (config, knowledge, workspace).

#### Scenario: Cancellation
- **WHEN** the user cancels the confirmation dialog.
- **THEN** the deletion is aborted and no API calls are made.

#### Scenario: Confirmed Deletion
- **WHEN** the user confirms the deletion in the dialog.
- **THEN** the UI MUST trigger a `DELETE` request to `/api/books/[bookId]`.

#### Scenario: Post-Deletion Redirect
- **WHEN** the `DELETE` API call succeeds.
- **THEN** the UI MUST redirect the user to the `/books` bookshelf page and refresh the page to show the updated list.

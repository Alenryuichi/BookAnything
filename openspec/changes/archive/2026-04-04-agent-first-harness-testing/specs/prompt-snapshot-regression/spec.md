## ADDED Requirements

### Requirement: Plan prompt contains required structural elements
The test suite SHALL verify that the plan prompt (built by `phases/plan.py`) contains key fragments: chapter listing format, eval feedback section, output JSON schema with `chapters_to_write` and `improvement_focus`.

#### Scenario: Plan prompt structural check
- **WHEN** `step_plan` builds a prompt from test config and mock state
- **THEN** the prompt text SHALL contain "chapters_to_write", "improvement_focus", and the project's book title

### Requirement: Write prompt contains writing methodology
The test suite SHALL verify that the chapter writing prompt (built by `phases/write.py`) contains key methodology fragments: "70%" text ratio, "opening_hook", "mermaid", "3000-5000" word count range.

#### Scenario: Write prompt methodology check
- **WHEN** `_write_single_chapter` builds a prompt for a test chapter
- **THEN** the prompt text SHALL contain "70%", "opening_hook", "mermaid", and the chapter title

### Requirement: Improve prompt contains component paths
The test suite SHALL verify that the improve webapp prompt (built by `phases/improve.py`) contains component file paths from diagnostics: `web-app/components/MermaidDiagram.tsx`, `web-app/components/CodeBlock.tsx`, `web-app/components/SearchClient.tsx` when those components are broken.

#### Scenario: Improve prompt references broken components
- **WHEN** report.json indicates mermaid and code blocks are broken
- **THEN** the improve prompt SHALL contain "MermaidDiagram.tsx" and "CodeBlock.tsx" file paths with diagnostic details

### Requirement: Prompt changes require review
When a prompt structural check fails, the test error message SHALL clearly indicate which key fragment is missing, enabling quick review of whether the change was intentional.

#### Scenario: Missing fragment produces clear error
- **WHEN** a prompt is missing "chapters_to_write"
- **THEN** the assertion error SHALL name the missing fragment

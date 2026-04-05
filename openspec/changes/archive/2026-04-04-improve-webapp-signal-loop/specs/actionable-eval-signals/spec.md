## ADDED Requirements

### Requirement: Component-level issue messages with file paths
The eval functions `eval_visual()` and `eval_interaction()` in `run.sh` SHALL produce `issues[]` entries that include the specific webapp component file path responsible for the failure. Each issue string MUST follow the format: `"<ComponentName> at <file-path>: <concrete diagnosis>"`. The file path MUST be relative to the harness root (e.g., `web-app/components/MermaidDiagram.tsx`).

#### Scenario: Mermaid rendering failure
- **WHEN** `diagnostics.mermaid.svgsRendered` is 0 across all chapter pages and `diagnostics.mermaid.jsLoaded` is false
- **THEN** the issue SHALL read like: `"MermaidDiagram at web-app/components/MermaidDiagram.tsx: 0 SVGs rendered, mermaid JS not loaded — check if mermaid.initialize() is called and if the mermaid library is imported correctly"`

#### Scenario: Mermaid containers exist but render fails
- **WHEN** `diagnostics.mermaid.containersFound` > 0 but `svgsRendered` is 0 and `renderErrors` is non-empty
- **THEN** the issue SHALL include the render error text and indicate that chart syntax may be invalid or the mermaid version incompatible

#### Scenario: Code blocks not rendering
- **WHEN** `diagnostics.codeBlock.preTagCount` is 0 across all chapter pages
- **THEN** the issue SHALL read like: `"CodeBlock at web-app/components/CodeBlock.tsx: 0 <pre> tags detected — component is not rendering code blocks at all, check if the component receives code data and renders a <pre> element"`

#### Scenario: Code blocks render but no syntax highlighting
- **WHEN** `diagnostics.codeBlock.preTagCount` > 0 but `shikiClassesFound` is false
- **THEN** the issue SHALL mention that shiki/highlighting is not being applied and suggest checking the shiki initialization

#### Scenario: Search cards not appearing
- **WHEN** `diagnostics.search.cardCountAfterQuery` is 0 despite `inputFound` being true
- **THEN** the issue SHALL read like: `"SearchClient at web-app/components/SearchClient.tsx: search input exists but 0 results after typing query — check if search data is loaded and filtering logic works"`

### Requirement: Root-cause-aware suggestions
The eval functions SHALL produce `suggestions[]` entries that describe a specific fix action tied to the diagnosed root cause, rather than generic guidance. Each suggestion MUST reference the component file to modify and describe what to check or change.

#### Scenario: Mermaid JS not loaded suggestion
- **WHEN** the mermaid issue indicates JS not loaded
- **THEN** the suggestion SHALL be like: `"In web-app/components/MermaidDiagram.tsx, verify that 'import mermaid from mermaid' and mermaid.initialize() are present and executed client-side (useEffect)"`

#### Scenario: Code highlighting not applied suggestion
- **WHEN** the code block issue indicates no highlighting classes
- **THEN** the suggestion SHALL be like: `"In web-app/components/CodeBlock.tsx, verify that shiki/highlight.js is imported and applied to the <pre>/<code> output; check that the highlighting runs client-side"`

#### Scenario: Search no results suggestion
- **WHEN** the search issue indicates 0 results after query
- **THEN** the suggestion SHALL be like: `"In web-app/components/SearchClient.tsx, verify that chapter data is fetched/imported for search indexing and that the filter function matches against the query string"`

### Requirement: Diagnostic data extraction from report.json
The eval functions SHALL read the new `diagnostics` fields from `report.json` using jq queries. The functions MUST aggregate diagnostics across all chapter pages (e.g., sum `svgsRendered` across all `chapter-*` page entries) to produce the component-level issues. The aggregation MUST handle missing pages gracefully (default to zero/false).

#### Scenario: Multiple chapter pages with mixed results
- **WHEN** some chapter pages have mermaid SVGs and others don't
- **THEN** the eval SHALL aggregate totals (e.g., `totalSvgsRendered`, `totalContainersFound`) and report the aggregate in the issue

#### Scenario: No chapter pages in report
- **WHEN** `report.json` has no `chapter-*` page entries
- **THEN** the eval SHALL use zero defaults for all diagnostic aggregates and not error

#### Scenario: Report.json missing diagnostics field (backward compat)
- **WHEN** an older `report.json` without `diagnostics` fields is read
- **THEN** the eval SHALL fall back to existing `metrics`-based logic and produce the current generic issues (no crash)

## ADDED Requirements

### Requirement: Mermaid rendering diagnostics
The visual test script (`scripts/visual-test.js`) SHALL collect mermaid rendering pipeline diagnostics for every page that could contain mermaid diagrams. The diagnostics object MUST include: whether the mermaid JS library loaded (`jsLoaded`: boolean), the count of `.mermaid` or `.mermaid-container` DOM elements found (`containersFound`: integer), the count of successfully rendered SVGs within those containers (`svgsRendered`: integer), any mermaid-specific render error text found in DOM error elements (`renderErrors`: string array), and any mermaid-related console errors captured during page load (`consoleErrors`: string array).

#### Scenario: Mermaid JS not loaded
- **WHEN** a chapter page is loaded and the mermaid library script fails to load or `window.mermaid` is undefined
- **THEN** `diagnostics.mermaid.jsLoaded` SHALL be `false` and `containersFound`, `svgsRendered` SHALL reflect the actual DOM state

#### Scenario: Mermaid containers exist but no SVGs rendered
- **WHEN** a chapter page has `.mermaid` or `.mermaid-container` elements but no `<svg>` children inside them
- **THEN** `diagnostics.mermaid.containersFound` SHALL be > 0, `svgsRendered` SHALL be 0, and any error text from `.mermaid-error` elements SHALL be captured in `renderErrors`

#### Scenario: Mermaid renders successfully
- **WHEN** mermaid containers are present and SVGs are rendered inside them
- **THEN** `diagnostics.mermaid.svgsRendered` SHALL equal the count of SVGs found, and `renderErrors` SHALL be empty

#### Scenario: Console errors related to mermaid
- **WHEN** the browser console emits error messages containing "mermaid" (case-insensitive) during page load
- **THEN** those error messages SHALL be captured in `diagnostics.mermaid.consoleErrors`

### Requirement: Code block highlighting diagnostics
The visual test script SHALL collect code block rendering diagnostics for every page. The diagnostics object MUST include: count of `<pre>` tags (`preTagCount`: integer), count of `<code>` tags (`codeTagCount`: integer), whether shiki-specific CSS classes are present on any code element (`shikiClassesFound`: boolean), and the count of code blocks that have syntax highlighting applied (`highlightedBlockCount`: integer — defined as `<pre>` or `<code>` elements with a `data-language` attribute or a class matching `/language-|shiki|hljs/`).

#### Scenario: No pre or code tags at all
- **WHEN** a chapter page has code content in the chapter JSON but zero `<pre>` and `<code>` tags in the rendered HTML
- **THEN** `diagnostics.codeBlock.preTagCount` and `codeTagCount` SHALL both be 0, indicating the CodeBlock component is not rendering

#### Scenario: Pre tags exist but no highlighting
- **WHEN** a chapter page has `<pre>` tags but none have shiki/highlighting classes
- **THEN** `diagnostics.codeBlock.preTagCount` SHALL be > 0, `shikiClassesFound` SHALL be `false`, and `highlightedBlockCount` SHALL be 0

#### Scenario: Full highlighting working
- **WHEN** code blocks have shiki classes applied and `data-language` attributes
- **THEN** `diagnostics.codeBlock.shikiClassesFound` SHALL be `true` and `highlightedBlockCount` SHALL be > 0

### Requirement: Search functionality diagnostics
The visual test script SHALL perform an active search interaction on the search page. It MUST type a test query into the search input, wait for results, and measure the resulting card count. The diagnostics object MUST include: whether a search input was found (`inputFound`: boolean), whether a query was successfully typed (`queryTyped`: boolean), the count of result elements after typing (`resultsAfterQuery`: integer), and the card count after typing (`cardCountAfterQuery`: integer).

#### Scenario: Search input missing
- **WHEN** the search page does not have an `<input>` element of type text or search
- **THEN** `diagnostics.search.inputFound` SHALL be `false` and all other search diagnostic fields SHALL be 0/false

#### Scenario: Search input exists but query produces no results
- **WHEN** the search page has an input, a test query is typed, and after waiting ≤3 seconds no result cards appear
- **THEN** `diagnostics.search.inputFound` SHALL be `true`, `queryTyped` SHALL be `true`, and `resultsAfterQuery` and `cardCountAfterQuery` SHALL be 0

#### Scenario: Search produces results
- **WHEN** a test query is typed and result cards appear within the wait period
- **THEN** `diagnostics.search.resultsAfterQuery` SHALL be > 0 and `cardCountAfterQuery` SHALL reflect the visible card count

### Requirement: Diagnostics output structure
Each page entry in `report.json` SHALL include a `diagnostics` object alongside the existing `metrics` object. The `diagnostics` object SHALL have three top-level keys: `mermaid`, `codeBlock`, and `search`. For non-chapter pages where mermaid/codeBlock diagnostics are not applicable, those sub-objects MAY contain zero/false defaults. The existing `metrics` object and `summary` structure MUST NOT be removed or altered.

#### Scenario: Chapter page report structure
- **WHEN** a chapter page is tested and results are written to `report.json`
- **THEN** `report.pages["chapter-xxx"]` SHALL contain both `metrics` (unchanged) and `diagnostics` with `mermaid`, `codeBlock`, and `search` sub-objects

#### Scenario: Non-chapter page report structure
- **WHEN** the home page or graph page is tested
- **THEN** `report.pages["home"].diagnostics` SHALL exist with default zero/false values for inapplicable diagnostics

#### Scenario: Backward compatibility
- **WHEN** eval functions read `report.json`
- **THEN** all existing `metrics` fields and `summary` fields SHALL be present and unchanged from their current format

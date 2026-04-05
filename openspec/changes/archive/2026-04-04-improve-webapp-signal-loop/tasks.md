## 1. Enhanced visual-test.js diagnostics

- [x] 1.1 Add console error categorization: capture all console errors during page load and tag them by component (mermaid, shiki, search, other) using regex matching in `scripts/visual-test.js`
- [x] 1.2 Add mermaid diagnostics collection: in the `page.evaluate()` block, check `typeof window.mermaid !== 'undefined'` for `jsLoaded`, count `.mermaid, .mermaid-container` for `containersFound`, count SVGs inside those containers for `svgsRendered`, and extract `.mermaid-error` text for `renderErrors`
- [x] 1.3 Add code block diagnostics collection: in the `page.evaluate()` block, count `<pre>` and `<code>` tags, check for elements with classes matching `/language-|shiki|hljs/` or `data-language` attribute for `shikiClassesFound` and `highlightedBlockCount`
- [x] 1.4 Add active search interaction: on the search page only, locate the input element, type a test query (first chapter title or fallback "tool"), wait up to 3 seconds, then measure result card count for `resultsAfterQuery` and `cardCountAfterQuery`
- [x] 1.5 Assemble `diagnostics` object per page result: combine mermaid, codeBlock, and search sub-objects into `results[name].diagnostics` alongside existing `metrics`; use zero/false defaults for non-applicable pages
- [x] 1.6 Verify backward compatibility: ensure existing `metrics` fields and `summary` structure are unchanged; run visual-test.js against a sample build output and validate `report.json` has both `metrics` and `diagnostics`

## 2. Enhanced eval functions in run.sh

- [x] 2.1 Add diagnostic aggregation helpers: in `eval_visual()`, use jq to extract and aggregate `diagnostics.mermaid` across all `chapter-*` pages — sum `svgsRendered`, `containersFound`, collect unique `renderErrors`; handle missing `diagnostics` gracefully with `// false` / `// 0` defaults
- [x] 2.2 Rewrite mermaid issues in `eval_visual()`: replace `"Mermaid: $mermaid_rendered rendered, $mermaid_errors errors"` with component-level message including file path `web-app/components/MermaidDiagram.tsx` and root cause from diagnostics (JS not loaded vs. containers missing vs. render errors)
- [x] 2.3 Add code block diagnostic aggregation: in `eval_interaction()`, aggregate `diagnostics.codeBlock` across chapter pages — sum `preTagCount`, check `shikiClassesFound` across pages
- [x] 2.4 Rewrite code block issues in `eval_interaction()`: replace `"无代码高亮: 所有页面 codeBlockCount=0"` with message naming `web-app/components/CodeBlock.tsx` and distinguishing "not rendering at all" vs. "rendering but no highlighting"
- [x] 2.5 Add search diagnostic extraction: in `eval_interaction()`, read `diagnostics.search` from the search page entry and produce issue with `web-app/components/SearchClient.tsx` path
- [x] 2.6 Rewrite all suggestions to be file-path-specific: replace generic suggestions like `"检查 Mermaid 图表语法和渲染组件"` with targeted suggestions referencing the component file and the specific thing to check (e.g., mermaid.initialize(), shiki import, search data loading)

## 3. Rewritten improve_webapp prompt

- [x] 3.1 Extract diagnostic signals from eval JSON: in `step_improve_webapp()`, read the latest eval JSON files to extract component-level issues and suggestions arrays; parse into individual diagnostic entries
- [x] 3.2 Build structured diagnostic JSON block: for each broken component (score=0), construct a JSON object with fields `component`, `file`, `status`, `diagnosis`, `fix_hint`, and optionally `console_errors`; order by score impact (mermaid 8pts > code 5pts > search 4pts)
- [x] 3.3 Extract and filter console errors from report.json: read console errors from chapter page entries, filter out noise (favicon, irrelevant warnings), and group by component relevance using regex matching
- [x] 3.4 Replace generic guidance section: remove the "常见问题和修复方向" numbered list and replace it with the structured diagnostic block; keep only static content (role description, path constraints, output format)
- [x] 3.5 Add fallback for missing eval data: when no eval JSON or report.json exists (first iteration), generate a default prompt listing all three component files with instruction to check each one

## 4. Integration testing

- [x] 4.1 End-to-end smoke test: run the full loop for 1 iteration on a test project to verify the pipeline works: visual-test produces diagnostics, eval reads them, improve_webapp prompt includes them
- [x] 4.2 Verify report.json schema: check that `report.json` output matches the schema defined in the design doc, with both `metrics` and `diagnostics` present for chapter and non-chapter pages
- [x] 4.3 Verify eval output: check that `eval_visual_iter*.json` and `eval_interaction_iter*.json` contain file-path-specific issues and suggestions, not generic ones

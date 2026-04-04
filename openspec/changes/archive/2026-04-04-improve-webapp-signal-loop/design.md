## Context

The harness runs a multi-step loop: Plan → Write chapters → Improve webapp → Review → Build → Visual Test → Evaluate. The improve_webapp step uses an LLM (Claude) to fix rendering bugs in the Next.js webapp, but it has been stuck for 20+ iterations because:

1. **`visual-test.js`** collects only shallow metrics (element counts like `mermaidCount`, `codeBlockCount`, `cardCount`) without diagnosing root causes. When `mermaidCount=0`, we don't know if mermaid JS failed to load, if containers are missing, or if chart data is malformed.

2. **`eval_visual()` / `eval_interaction()`** in `run.sh` produce generic issues like `"Mermaid: 0 rendered, 0 errors"` with suggestions like `"检查 Mermaid 图表语法和渲染组件"`. These lack the specificity for an LLM to act on.

3. **`step_improve_webapp()`** passes these vague signals in a prompt with a generic "常见问题和修复方向" checklist. The LLM has no way to prioritize or pinpoint the actual broken component.

Key webapp components involved: `MermaidDiagram.tsx`, `CodeBlock.tsx`, `SearchClient.tsx` in `web-app/components/`.

## Goals / Non-Goals

**Goals:**
- Make `visual-test.js` capture enough diagnostic data to distinguish between failure modes (JS not loaded vs. container missing vs. render error vs. data missing)
- Make eval functions produce issues that name the specific component file path and describe the concrete failure
- Make the improve_webapp prompt feed structured diagnostics so the LLM can go directly to the broken file and apply a targeted fix
- Maintain backward compatibility: existing scoring formulas continue to work; new diagnostics are additive fields

**Non-Goals:**
- Changing the scoring formulas themselves (scores stay the same; only issues/suggestions improve)
- Adding new test pages or expanding visual-test coverage to new routes
- Modifying chapter JSON data or the knowledge pipeline
- Making the eval step non-deterministic (it stays formula-based, no LLM calls)
- Fixing the actual component bugs (that's the improve_webapp step's job, enabled by better signals)

## Decisions

### 1. Diagnostics live in `report.json` as a `diagnostics` object per page

**Choice**: Add a `diagnostics` field alongside existing `metrics` in each page result, rather than writing a separate diagnostics file.

**Rationale**: Keeps the data pipeline simple — `visual-test.js` writes one file, eval reads one file. The `diagnostics` object is structured by component concern (mermaid, codeBlock, search) so eval can extract exactly what it needs.

**Alternative considered**: Separate `diagnostics.json` file — rejected because it doubles the file I/O surface and requires coordinating two files in eval functions.

**Schema addition per page**:
```json
{
  "diagnostics": {
    "mermaid": {
      "jsLoaded": false,
      "containersFound": 0,
      "svgsRendered": 0,
      "renderErrors": ["error text..."],
      "consoleErrors": ["mermaid-related console errors..."]
    },
    "codeBlock": {
      "preTagCount": 0,
      "codeTagCount": 0,
      "shikiClassesFound": false,
      "highlightedBlockCount": 0
    },
    "search": {
      "inputFound": false,
      "queryTyped": false,
      "resultsAfterQuery": 0,
      "cardCountAfterQuery": 0
    }
  }
}
```

### 2. Eval issues include file paths via a static component map

**Choice**: Hardcode a mapping from diagnostic concern to component file path in the eval bash functions (e.g., mermaid → `web-app/components/MermaidDiagram.tsx`).

**Rationale**: The component file paths are stable (they don't change between iterations). A static map in bash is simpler and more reliable than trying to discover paths dynamically. If a component is renamed, the map is updated in one place.

**Alternative considered**: Have visual-test.js discover component paths from the source tree — rejected because visual-test.js runs against the build output, not the source, and this adds unnecessary complexity.

### 3. Improve_webapp prompt uses structured JSON diagnostic block

**Choice**: Format the diagnostic signals as a structured JSON block with clear headings per component, rather than embedding them in prose.

**Rationale**: LLMs parse structured data better than prose when making code changes. A format like `{ "component": "MermaidDiagram.tsx", "file": "web-app/components/MermaidDiagram.tsx", "status": "BROKEN", "root_cause": "...", "fix_hint": "..." }` lets the LLM jump straight to the fix.

**Alternative considered**: Prose-style diagnostic paragraphs — rejected because the current vague prose is exactly what's failing.

### 4. Search diagnostic uses active interaction (type a query)

**Choice**: In visual-test.js, for the search page, type a test query string into the search input and wait for results, then measure card count.

**Rationale**: The current test only checks if an input exists. The actual failure might be that search works but no initial results are shown, or that the search handler is broken. Actively typing reveals more failure modes.

**Test query**: Use the first chapter title from the build output, falling back to a generic term like "tool" if unavailable.

## Risks / Trade-offs

- **[Risk] Hardcoded component paths become stale** → Mitigation: paths are checked at proposal time and are structurally stable; add a comment in the eval functions noting the mapping so future changes are easy.

- **[Risk] Active search interaction increases visual-test runtime** → Mitigation: only done on the search page; adds ~2 seconds total. Acceptable for the value gained.

- **[Risk] Diagnostic data bloats report.json** → Mitigation: diagnostics add ~500 bytes per page; report.json stays well under 100KB even with 15+ pages.

- **[Risk] Console error filtering for mermaid may miss some error formats** → Mitigation: use broad matching (`/mermaid/i`) and also check for `.mermaid-error` DOM elements as fallback.

- **[Trade-off] Static component map vs. dynamic discovery**: We sacrifice flexibility for simplicity. This is appropriate because component paths change only during major refactors, not during the iterative improve loop.

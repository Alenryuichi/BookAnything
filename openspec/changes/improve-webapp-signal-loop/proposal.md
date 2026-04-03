## Why

The `step_improve_webapp()` loop has been ineffective for 20+ iterations because the LLM fixing the webapp receives vague, unactionable feedback. The eval produces generic issues like "Mermaid: 0 rendered, 0 errors" and suggestions like "检查 Mermaid 图表语法和渲染组件" — but never identifies WHICH component file is broken, WHAT the root cause is, or HOW to fix it. Meanwhile, `visual-test.js` only collects shallow metrics (element counts) without diagnosing WHY those counts are zero. This creates a broken feedback loop where the same problems persist iteration after iteration.

Current score bottleneck: Mermaid rendering 0/8 (chapters have mermaid data but Playwright detects 0 SVGs), code highlighting 0/5 (CodeBlock/shiki not producing `<pre>` tags), and search results 0/4 (search has input but cardCount=0). All three have been stuck at zero for many iterations.

## What Changes

- **Enhanced visual-test.js diagnostics**: Extend Playwright tests to capture component-level root cause data — check if mermaid JS loaded, if `.mermaid` containers exist, if render errors appear in console; check if shiki CSS/`<pre>`/`<code>` tags exist; type a test query in search and check if results appear. Output structured `diagnostics{}` per page in `report.json`.
- **Actionable eval issues**: Rewrite `eval_visual()` and `eval_interaction()` in `run.sh` to produce component-level diagnostics in `issues[]` that include the specific file path to fix (e.g., `web-app/components/MermaidDiagram.tsx`) and a concrete description of what's wrong.
- **Rewritten improve_webapp prompt**: Replace the generic "常见问题和修复方向" section with structured diagnostic input drawn directly from the enhanced report, so the LLM knows exactly which file to open and what to change.

## Capabilities

### New Capabilities
- `visual-test-diagnostics`: Deep component-level diagnostic data collection in `visual-test.js`, producing structured `diagnostics{}` objects per page in `report.json` covering mermaid rendering pipeline, code block highlighting pipeline, and search functionality pipeline.
- `actionable-eval-signals`: Enhanced deterministic eval functions that produce file-path-specific, root-cause-aware issues and suggestions instead of generic descriptions.
- `improve-webapp-prompt`: Restructured `step_improve_webapp()` prompt that feeds precise diagnostic signals as structured input to the LLM, replacing vague guidance with concrete repair instructions.

### Modified Capabilities
<!-- No existing specs to modify — this is the first change in this OpenSpec project. -->

## Impact

- **Files modified**: `scripts/visual-test.js`, `run.sh` (functions: `eval_visual`, `eval_interaction`, `step_improve_webapp`)
- **Data contract**: `report.json` gains new `diagnostics` fields per page — downstream consumers (eval functions) must be updated in lockstep
- **Dependencies**: No new npm/system dependencies; all diagnostics use existing Playwright page.evaluate() capabilities
- **Risk**: Minimal — changes are additive to `report.json` and backward-compatible with existing eval formulas; scores only improve if diagnostics are acted on

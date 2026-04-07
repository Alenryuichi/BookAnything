## Why

`graph-driven-planning` left three follow-up gaps between the promised behavior and the shipped implementation. Until they are closed, the init pipeline still sends too much raw code to Claude, graph validation over-escalates warnings, and the web app cannot consume the separate outline artifact that the design introduced.

## What Changes

- Make `step_analyze` consume `StaticGraph` context so batch prompts prefer structural summaries over full file contents when static analysis is available.
- Correct graph validation severity reporting so SSE warning events only fire when orphaned semantic nodes exceed the intended threshold.
- Load `chapter-outline.json` alongside `knowledge-graph.json` in the web app data layer so the dual-graph output is actually consumable.
- Add or update focused tests covering static-graph-assisted analysis prompts, orphan-threshold logging, and outline loading behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-init-cli`: init must pass static-graph results through the analyze phase so the promised token-saving path is exercised during book initialization.
- `chapter-planner`: planning outputs consumed by downstream code must expose the persisted `chapter-outline.json` artifact, not just the knowledge graph.
- `book-creation-api`: graph validation events emitted during init must distinguish informational warnings from severe orphan-rate conditions.

## Impact

- `pyharness/phases/analyze.py` prompt construction and `step_analyze(...)` signature/flow
- `pyharness/init.py` handoff between `build_static_graph(...)` and analyze
- `pyharness/graph_validate.py` SSE logging thresholds
- `web-app/lib/load-knowledge.ts` outline loading and returned data shape
- Targeted regression tests for the repaired behaviors

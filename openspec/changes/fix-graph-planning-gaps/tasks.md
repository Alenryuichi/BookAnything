## 1. Static Graph Analyze Handoff

- [x] 1.1 Update `step_analyze` and its helper chain to accept an optional `StaticGraph` input
- [x] 1.2 Build per-file static summaries in `_build_batch_prompt(...)` and keep raw-source fallback for uncovered files
- [x] 1.3 Pass init-phase `StaticGraph` output into analyze and add focused prompt-construction coverage

## 2. Validation Severity Threshold

- [x] 2.1 Refactor validation-result logging to receive the total semantic node count from the merged graph
- [x] 2.2 Emit severe `graph_validate` SSE events only when orphaned semantic nodes exceed 30 percent of semantic nodes
- [x] 2.3 Add regression tests for both above-threshold and below-threshold validation outcomes

## 3. Outline Loader Contract

- [x] 3.1 Extend the web-app knowledge loading contract to include parsed `chapter-outline.json` data
- [x] 3.2 Implement backward-compatible fallback behavior when `chapter-outline.json` is missing or invalid
- [x] 3.3 Add focused coverage for outline-present and outline-missing loader behavior

## 4. Verification

- [x] 4.1 Run targeted tests covering analyze prompt changes, validation logging, and knowledge loading
- [x] 4.2 Manually verify the change artifacts remain apply-ready and aligned with the three reviewed GAPs

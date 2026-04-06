## Context

`graph-driven-planning` already introduced the right pipeline shape, but three key promises are still not enforced end to end: `StaticGraph` is produced but not consumed by analyze prompts, graph validation escalates any orphan into a severe SSE event, and the web app loader ignores `chapter-outline.json`. The gaps span Python pipeline orchestration, logging semantics, and the Next.js data layer, so a short design is warranted before implementation.

## Goals / Non-Goals

**Goals:**
- Realize the intended token-saving path by threading `StaticGraph` through init into batch prompt construction
- Make graph validation severity depend on the actual orphan ratio instead of any orphan count
- Expose `chapter-outline.json` through the web app's knowledge loading contract with backward-compatible fallbacks
- Add focused regression coverage for all three repaired behaviors

**Non-Goals:**
- Redesign the graph-driven planning algorithm or chapter-outline schema
- Introduce new SSE event types beyond correcting the current severity gate
- Build new UI for outline visualization in this change

## Decisions

### Decision 1: Thread `StaticGraph` through the existing analyze call chain

`build_static_graph(...)` already runs during init, so the least risky fix is to propagate an optional `static_graph` argument through `step_analyze`, `_run_batch_analysis`, `_analyze_batch`, and `_build_batch_prompt`.

Why this approach:
- It repairs the exact missing handoff without changing the broader analyze architecture
- It allows per-file fallback: files with static coverage use summaries, unsupported files can still send raw source
- It keeps the token-saving logic close to prompt construction, where tests can assert the intended prompt shape

Alternative considered: rebuilding batch analysis around a brand new intermediate prompt model. Rejected because it adds churn without improving the narrow gap fix.

### Decision 2: Base severe validation events on explicit semantic totals

The current logger only receives `warnings`, which forces it to guess at the semantic node count. The fix should pass explicit graph context into validation result logging, either by changing `log_validation_results(...)` to accept the `KnowledgeGraph` or by passing a compact summary object with `semantic_count`.

Why this approach:
- It makes the >30 percent threshold deterministic and testable
- It avoids duplicating semantic-node counting logic in multiple places
- It preserves existing warning logs while narrowing only the SSE escalation behavior

Alternative considered: infer severity from warning counts alone. Rejected because orphan warnings are not equivalent to total semantic nodes.

### Decision 3: Treat `chapter-outline.json` as an optional companion artifact in the web loader

`loadKnowledge(...)` should extend its returned shape with parsed outline data from `chapter-outline.json` when present, while older books continue to load successfully with a null or empty outline value. Parsing should be tolerant, matching the existing loader style for other generated artifacts.

Why this approach:
- It makes the dual-graph design visible to downstream code without forcing an immediate UI rewrite
- It preserves compatibility for books generated before outline persistence existed
- It localizes the change to the server-side data layer and shared types/schemas

Alternative considered: keep the loader unchanged and make callers read the file directly. Rejected because it fragments the contract and repeats filesystem logic.

## Risks / Trade-offs

- [Risk] Static summaries may omit details needed for a hard-to-parse file. -> Mitigation: keep per-file fallback to raw source when static coverage is missing or insufficient.
- [Risk] Extending `KnowledgeBase` can ripple into callers that assume the old shape. -> Mitigation: add the new field as optional or defaulted so existing reads remain valid.
- [Risk] Threshold logic can silently drift if semantic-node filtering changes later. -> Mitigation: centralize the semantic count next to validation and cover both above-threshold and below-threshold cases with tests.

## Migration Plan

- Implement the new arguments and loader fields in a backward-compatible way
- Regenerate knowledge for new books automatically; no data migration is required for existing books
- Treat missing `chapter-outline.json` as a supported legacy state

## Open Questions

- None. The three gaps are narrowly scoped and have clear acceptance criteria from the earlier review.

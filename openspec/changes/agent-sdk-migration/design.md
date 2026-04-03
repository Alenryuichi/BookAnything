## Context

The harness drives a multi-phase book-generation loop: Plan → Write chapters → Improve webapp → Code review → Build site → Visual test → Evaluate. Today this is implemented as a single 1,228-line bash script (`run.sh`) that:

- Calls the Claude CLI via `claude -p "$(cat prompt)" --output-format json --allowedTools "..."` with heredoc prompts
- Cleans model output with sed/grep/jq heuristics (strip markdown fences, extract first `{` to last `}`)
- Manages parallel chapter writing with `&`, `wait`, and PID tracking
- Computes deterministic evaluation scores with bash arithmetic and jq
- Manages state via a `state.json` file updated with `jq` and `mktemp`/`mv`
- Uses a lock file, `timeout`/`gtimeout` fallback, and signal traps for process management

Stakeholders: harness maintainers (1-2 developers). No external consumers — the Python harness is an internal tool.

Constraints:
- Must produce identical `state.json`, chapter JSON, and evaluation scores (byte-level score parity)
- Must not break the existing `.claude/` capability layer (rules, skills, hooks)
- Must coexist with `run.sh` during the migration period
- Python 3.11+ (for `asyncio.TaskGroup`, `tomllib`, improved `typing`)

## Goals / Non-Goals

**Goals:**
- Replace bash orchestration with typed, testable Python that is easier to extend
- Gain structured output from the Claude Agent SDK (no more JSON-cleaning hacks)
- Enable proper async parallel execution with concurrency limits and error propagation
- Maintain score parity: Python eval functions must produce identical scores to bash for the same inputs
- Provide a clean CLI entry point with the same flags as `run.sh`
- Incremental migration: each phase can be ported and verified independently

**Non-Goals:**
- Rewriting the `.claude/` capability layer (rules, skills, hooks stay as-is)
- Changing the chapter JSON schema or `state.json` format
- Replacing the Next.js web-app build/test pipeline (stays as `npm run build` / Playwright)
- Adding new harness features (streaming UI, web dashboard) — those come later on top of Python
- Supporting Python < 3.11
- Removing `run.sh` in this change — it stays as fallback

## Decisions

### D1: Python with Claude Agent SDK (not TypeScript, not raw HTTP)

**Choice:** Python + `claude-agent-sdk` package

**Rationale:** The Agent SDK provides a typed `Claude` client with structured output, automatic tool management, retry logic, and streaming — exactly what we're building manually in bash. Python is the SDK's primary language with the most mature API. TypeScript SDK exists but is less mature, and we'd lose Pydantic's validation ecosystem. Raw HTTP to the Anthropic API would mean reimplementing tool handling and conversation management.

**Alternatives considered:**
- TypeScript: Good type safety but less mature Agent SDK, would require separate runtime from Python-based project analysis
- Direct Anthropic API calls: More control but requires reimplementing conversation turns, tool use, and output parsing

### D2: Package structure — flat `harness/` package (not monorepo, not single file)

**Choice:** `harness/` directory as a Python package with submodules:

```
harness/
  __init__.py
  __main__.py          # CLI entry point
  runner.py            # HarnessRunner orchestrator
  config.py            # YAML config loading
  schemas.py           # Pydantic models
  eval.py              # Deterministic evaluation
  phases/
    __init__.py
    plan.py            # step_plan
    write.py           # step_analyze (parallel chapter writing)
    improve.py         # step_improve_webapp
    review.py          # step_code_review
    build.py           # step_build_site
    visual_test.py     # step_visual_test
  state.py             # state.json read/write
  claude_client.py     # Agent SDK wrapper
```

**Rationale:** Each bash function maps to a module. The `phases/` subdirectory keeps the 7 pipeline stages isolated. A single `runner.py` replaces the bash `main()` loop. This structure makes it possible to port one phase at a time and test in isolation.

**Alternatives considered:**
- Single `harness.py` file: simpler but would grow to 1000+ lines quickly, same problem as bash
- Monorepo with separate packages per phase: over-engineered for a single-developer tool

### D3: Claude SDK usage pattern — structured output with Pydantic response models

**Choice:** Use the Agent SDK's structured output mode by passing Pydantic models as `response_model` to get validated JSON directly from the API call, eliminating all sed/grep/jq cleaning.

```python
plan = await client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": prompt}],
    response_model=PlanOutput,  # Pydantic model → guaranteed valid JSON
)
```

**Rationale:** The entire JSON-cleaning section of `run_claude()` (lines 173-198 in `run.sh`) exists because the CLI returns unstructured text that may contain markdown fences or preamble. Structured output eliminates this class of bugs entirely.

### D4: Async execution model — `asyncio.gather()` with semaphore

**Choice:** Use `asyncio.gather()` with an `asyncio.Semaphore(max_parallel)` for concurrent chapter writing, replacing bash `&`/`wait` PID tracking.

```python
sem = asyncio.Semaphore(max_parallel)

async def write_one(chapter_id: str) -> ChapterResult:
    async with sem:
        return await self._write_chapter(chapter_id, iteration)

results = await asyncio.gather(
    *[write_one(cid) for cid in chapters_to_write],
    return_exceptions=True,
)
```

**Rationale:** The bash version tracks PIDs in arrays, polls with `wait -n`, and has no way to propagate structured errors from child processes. `asyncio.gather` with `return_exceptions=True` gives per-chapter error reporting while respecting concurrency limits.

### D5: Evaluation parity — port formulas exactly, validate with comparison tests

**Choice:** Port each bash eval function (`eval_content`, `eval_visual`, `eval_interaction`, `merge_scores`) to Python with identical arithmetic. During migration, run both bash and Python eval on the same inputs and assert score equality.

**Rationale:** The evaluation formulas use integer arithmetic (bash truncation behavior), specific thresholds (e.g., `fsize > 10240 && sections >= 4`), and particular jq field access patterns. Any rounding or logic difference would break the feedback loop. Comparison testing during migration catches drift.

### D6: Config loading — keep YAML, add Pydantic validation

**Choice:** Load `projects/*.yaml` and `goals.yaml` with PyYAML, validate into Pydantic `ProjectConfig` and `GoalsConfig` models.

**Rationale:** The bash version parses YAML with `grep` and `sed` (fragile, can't handle nested structures). Pydantic validation catches config errors at load time with clear messages. YAML format stays the same — no migration needed for config files.

### D7: State management — atomic write with same `state.json` format

**Choice:** Read/write `state.json` with the same schema, using `tempfile` + `os.replace()` for atomic updates (same pattern as bash `mktemp` + `mv`).

**Rationale:** Interoperability with `run.sh` during migration — either harness can read the other's state file. `os.replace()` is atomic on POSIX, matching the bash `mv` behavior.

## Risks / Trade-offs

**[Score drift between Python and bash eval]** → Mitigation: comparison test suite that runs both implementations on fixture data and asserts identical scores. Run during CI and during the migration period.

**[Agent SDK API instability]** → Mitigation: wrap SDK calls in a thin `claude_client.py` adapter. If the SDK API changes, only one file needs updating. Pin SDK version in `requirements.txt`.

**[Two codepaths during migration]** → Mitigation: time-box migration to 4 phases (eval → plan → write → remaining). Each phase is independently verifiable. Set a deadline to deprecate `run.sh` after all phases are ported and tested.

**[`.claude/` context loading]** → The Claude CLI automatically loads `.claude/rules` and `.claude/skills` from the working directory. The Agent SDK may not do this automatically. Mitigation: the Python harness must explicitly read and inject relevant rule/skill content into prompts, or invoke the CLI in a subprocess for phases that need the capability layer. Investigate SDK support for project context loading.

**[Prompt regression]** → Bash heredoc prompts embed state inline. Python string templates (Jinja2 or f-strings) may produce subtly different prompts. Mitigation: capture prompt snapshots from bash runs and diff against Python-generated prompts during migration.

## Migration Plan

**Phase 1 — Evaluation** (lowest risk, deterministic):
Port `eval_content`, `eval_visual`, `eval_interaction`, `merge_scores` to `harness/eval.py`. Validate with comparison tests against bash output on real chapter data.

**Phase 2 — Plan**:
Port `step_plan` to `harness/phases/plan.py` using Agent SDK structured output. Compare plan JSON output between bash and Python on same inputs.

**Phase 3 — Write chapters**:
Port `step_analyze` to `harness/phases/write.py` with async parallel execution. Verify chapter JSON output matches schema. This is the highest-value migration (parallel execution, error handling).

**Phase 4 — Remaining phases**:
Port `step_improve_webapp`, `step_code_review`, `step_build_site`, `step_visual_test` and wire into `HarnessRunner.run()`. At this point `run.sh` becomes fallback-only.

**Rollback:** At any point, `run.sh` can be used instead. State files are interoperable.

## Open Questions

1. **Agent SDK project context**: Does the SDK support automatic loading of `.claude/rules` and `.claude/skills` from the working directory, or must we inject this content manually into prompts?
2. **Streaming vs. batch**: Should the Python harness stream chapter output for progress feedback, or is batch-mode sufficient for a headless tool?
3. **Prompt template engine**: f-strings are simplest but limited. Jinja2 adds conditionals/loops but is another dependency. Which is the right trade-off for prompt complexity?

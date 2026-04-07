## 1. Project Scaffolding

- [x] 1.1 Create `pyharness/` Python package directory with `__init__.py`, `__main__.py`, and submodules (`runner.py`, `config.py`, `schemas.py`, `eval.py`, `state.py`, `claude_client.py`, `log.py`)
- [x] 1.2 Create `pyharness/phases/` subpackage with `__init__.py` and phase modules (`plan.py`, `write.py`, `improve.py`, `review.py`, `build.py`, `visual_test.py`)
- [x] 1.3 Create `requirements.txt` with dependencies: `pydantic>=2.0`, `pyyaml`, and dev dependencies (`pytest`, `pytest-asyncio`)
- [x] 1.4 Create `pyproject.toml` with package metadata and `[project.scripts]` entry point for `python -m pyharness`

## 2. Pydantic Schema Models

- [x] 2.1 Implement `PlanOutput` model in `pyharness/schemas.py` with fields: `plan_summary`, `chapters_to_write`, `needs_webapp_improve`, `webapp_improve_focus`, `improvement_focus`
- [x] 2.2 Implement `ChapterJSON` model in `pyharness/schemas.py` matching the chapter-json-contract rule
- [x] 2.3 Implement `EvalResult` and dimension breakdown models (`DimensionEval`, `MergedEval`, `ScoresBreakdown`) in `pyharness/schemas.py`
- [x] 2.4 Implement `HarnessState` model in `pyharness/schemas.py` matching the `state.json` format
- [x] 2.5 Implement `ProjectConfig` model in `pyharness/config.py` for `projects/*.yaml` parsing with YAML loader
- [x] 2.6 Verified: loaded existing `state.json` and project YAML into Pydantic models, confirmed round-trip works

## 3. Deterministic Evaluation (Phase 1 Migration)

- [x] 3.1 Port `eval_content()` to `pyharness/eval.py` — identical integer arithmetic for coverage, volume, depth
- [x] 3.2 Port `eval_visual()` to `pyharness/eval.py` — build_score, error_score, mermaid_score, layout_score from `report.json`
- [x] 3.3 Port `eval_interaction()` to `pyharness/eval.py` — search, navigation, code_highlight, page_routing
- [x] 3.4 Port `merge_scores()` to `pyharness/eval.py` — combine dimension scores + format_feedback()
- [x] 3.5 Implement issues/suggestions generation with same threshold conditions as bash
- [x] 3.6 Write comparison tests: run bash and Python eval on fixture data, assert identical scores

## 4. State Management

- [x] 4.1 Implement `StateManager` in `pyharness/state.py` with `load()`, `init()`, and `update_after_eval()` using atomic `tempfile` + `os.replace()`
- [x] 4.2 Implement `asyncio.Lock`-based serialization for concurrent state updates
- [x] 4.3 Verified: loaded bash-generated `state.json` successfully (21 iterations of history)

## 5. Claude Agent SDK Client Wrapper

- [x] 5.1 Implement `ClaudeClient` in `pyharness/claude_client.py` wrapping `claude -p` CLI with configurable timeout and tool permissions
- [x] 5.2 Add structured output support: accept Pydantic `response_model` parameter, return validated instances
- [x] 5.3 Add retry logic with exponential backoff for transient errors
- [x] 5.4 Add timeout enforcement using `asyncio.wait_for()` with configurable per-call timeout
- [x] 5.5 `.claude/` context loading works automatically via `claude -p` (CLI loads project context from cwd)

## 6. Plan Phase (Phase 2 Migration)

- [x] 6.1 Implement `step_plan()` in `pyharness/phases/plan.py` — build prompt from state, project config, existing chapters, and last eval feedback
- [x] 6.2 Use `ClaudeClient` with `PlanOutput` response model for structured planning output
- [x] 6.3 Implement fallback logic: if `chapters_to_write` is empty, compute unwritten chapters from project config
- [x] 6.4 Write test: compare plan prompt content with bash heredoc output for same inputs

## 7. Write Phase (Phase 3 Migration)

- [x] 7.1 Implement `step_write_chapters()` in `pyharness/phases/write.py` with `asyncio.gather()` + `asyncio.Semaphore(max_parallel)`
- [x] 7.2 Implement single chapter writer using `ClaudeClient` with appropriate tool permissions (Read, Glob, Grep)
- [x] 7.3 Implement per-chapter error isolation with `return_exceptions=True`
- [x] 7.4 Implement chapter prompt builder: inject project context, chapter metadata, writing style rules
- [x] 7.5 Write test: verify concurrency limit is respected, verify error isolation

## 8. Remaining Phases (Phase 4 Migration)

- [x] 8.1 Implement `step_improve_webapp()` in `pyharness/phases/improve.py` — port prompt and tool permissions
- [x] 8.2 Implement `step_code_review()` in `pyharness/phases/review.py` — port prompt and read-only tool permissions
- [x] 8.3 Implement `step_build_site()` in `pyharness/phases/build.py` — shell out to `npm run build`
- [x] 8.4 Implement `step_visual_test()` in `pyharness/phases/visual_test.py` — shell out to Playwright screenshot script
- [x] 8.5 Implement `step_checkpoint()` — git add/commit with iteration number and score

## 9. HarnessRunner Orchestrator

- [x] 9.1 Implement `HarnessRunner` in `pyharness/runner.py` with constructor accepting `ProjectConfig`, `max_hours`, `threshold`, `max_parallel`, `resume`
- [x] 9.2 Implement `run()` method wiring all phases in sequence with main loop, time limit, score threshold, cooldown
- [x] 9.3 Implement lock file management (create on start, cleanup on exit via `atexit` and signal handlers)
- [x] 9.4 Implement logging system with level-based formatting matching bash output

## 10. CLI Entry Point

- [x] 10.1 Implement `__main__.py` with `argparse` for `run` subcommand with all flags
- [x] 10.2 Wire CLI to `HarnessRunner` — parse args, load config, instantiate runner, call `asyncio.run(runner.run())`
- [x] 10.3 Verified: `--help` output covers all flags

## 11. Integration Testing

- [x] 11.1 Write end-to-end test: run Python harness for 1 iteration on test fixtures, verify `state.json` is updated correctly
- [x] 11.2 Write comparison test: run both bash and Python harness on same initial state, compare resulting `state.json` and eval scores
- [x] 11.3 Verify interoperability: start with bash for iteration 1, switch to Python for iteration 2, confirm state continuity

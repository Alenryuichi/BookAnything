## 1. Project Scaffolding

- [ ] 1.1 Create `harness/` Python package directory with `__init__.py`, `__main__.py`, and empty submodules (`runner.py`, `config.py`, `schemas.py`, `eval.py`, `state.py`, `claude_client.py`)
- [ ] 1.2 Create `harness/phases/` subpackage with `__init__.py` and empty phase modules (`plan.py`, `write.py`, `improve.py`, `review.py`, `build.py`, `visual_test.py`)
- [ ] 1.3 Create `requirements.txt` with pinned dependencies: `claude-agent-sdk`, `pydantic>=2.0`, `pyyaml`, and dev dependencies (`pytest`, `pytest-asyncio`)
- [ ] 1.4 Create `pyproject.toml` with package metadata and `[project.scripts]` entry point for `python -m harness`

## 2. Pydantic Schema Models

- [ ] 2.1 Implement `PlanOutput` model in `harness/schemas.py` with fields: `plan_summary`, `chapters_to_write`, `needs_webapp_improve`, `webapp_improve_focus`, `improvement_focus`
- [ ] 2.2 Implement `ChapterJSON` model in `harness/schemas.py` matching the chapter-json-contract rule (read `.claude/rules/chapter-json-contract.md` for field definitions)
- [ ] 2.3 Implement `EvalResult` and dimension breakdown models (`ContentEval`, `VisualEval`, `InteractionEval`) in `harness/schemas.py`
- [ ] 2.4 Implement `HarnessState` model in `harness/schemas.py` matching the `state.json` format
- [ ] 2.5 Implement `ProjectConfig` model in `harness/config.py` for `projects/*.yaml` parsing with YAML loader
- [ ] 2.6 Write tests: load existing `state.json` and chapter JSON files from `knowledge/` into Pydantic models, verify round-trip serialization

## 3. Deterministic Evaluation (Phase 1 Migration)

- [ ] 3.1 Port `eval_content()` to `harness/eval.py` — implement coverage, volume, depth formulas with identical integer arithmetic
- [ ] 3.2 Port `eval_visual()` to `harness/eval.py` — implement build_score, error_score, mermaid_score, layout_score from `report.json`
- [ ] 3.3 Port `eval_interaction()` to `harness/eval.py` — implement navigation, code_blocks, search, responsive scoring
- [ ] 3.4 Port `merge_scores()` to `harness/eval.py` — combine dimension scores into final evaluation JSON
- [ ] 3.5 Implement issues/suggestions generation with same threshold conditions as bash
- [ ] 3.6 Write comparison tests: run bash `eval_content`/`eval_visual`/`eval_interaction` on fixture data, compare output with Python versions, assert identical scores

## 4. State Management

- [ ] 4.1 Implement `StateManager` in `harness/state.py` with `load()`, `save()`, and `update()` methods using atomic `tempfile` + `os.replace()`
- [ ] 4.2 Implement `asyncio.Lock`-based serialization for concurrent state updates
- [ ] 4.3 Write tests: verify round-trip with bash-generated `state.json`, verify atomic write survives interruption

## 5. Claude Agent SDK Client Wrapper

- [ ] 5.1 Implement `ClaudeClient` in `harness/claude_client.py` wrapping the Agent SDK with configurable model, timeout, and tool permissions
- [ ] 5.2 Add structured output support: accept Pydantic `response_model` parameter, return validated instances
- [ ] 5.3 Add retry logic with exponential backoff for transient errors (network, rate limit, 5xx)
- [ ] 5.4 Add timeout enforcement using `asyncio.wait_for()` with configurable per-call timeout
- [ ] 5.5 Investigate and implement `.claude/` context loading — either SDK-native project context or manual rule/skill injection into prompts

## 6. Plan Phase (Phase 2 Migration)

- [ ] 6.1 Implement `step_plan()` in `harness/phases/plan.py` — build prompt from state, project config, existing chapters, and last eval feedback
- [ ] 6.2 Use `ClaudeClient` with `PlanOutput` response model for structured planning output
- [ ] 6.3 Implement fallback logic: if `chapters_to_write` is empty, compute unwritten chapters from project config
- [ ] 6.4 Write test: compare plan prompt content with bash heredoc output for same inputs

## 7. Write Phase (Phase 3 Migration)

- [ ] 7.1 Implement `step_write_chapters()` in `harness/phases/write.py` with `asyncio.gather()` + `asyncio.Semaphore(max_parallel)`
- [ ] 7.2 Implement single chapter writer using `ClaudeClient` with `ChapterJSON` response model and appropriate tool permissions (Read, Glob, Grep)
- [ ] 7.3 Implement per-chapter error isolation with `return_exceptions=True`
- [ ] 7.4 Implement chapter prompt builder: inject project context, chapter metadata, existing chapters summary, writing style rules from `CLAUDE.md`
- [ ] 7.5 Write test: verify concurrency limit is respected (mock SDK calls with delays), verify error isolation

## 8. Remaining Phases (Phase 4 Migration)

- [ ] 8.1 Implement `step_improve_webapp()` in `harness/phases/improve.py` — port prompt and tool permissions (Read, Write, Glob, Grep, Shell)
- [ ] 8.2 Implement `step_code_review()` in `harness/phases/review.py` — port prompt and read-only tool permissions
- [ ] 8.3 Implement `step_build_site()` in `harness/phases/build.py` — shell out to `npm run build` in `web-app/` directory
- [ ] 8.4 Implement `step_visual_test()` in `harness/phases/visual_test.py` — shell out to Playwright screenshot script
- [ ] 8.5 Implement `step_checkpoint()` — git add/commit with iteration number and score

## 9. HarnessRunner Orchestrator

- [ ] 9.1 Implement `HarnessRunner` in `harness/runner.py` with constructor accepting `ProjectConfig`, `max_hours`, `threshold`, `max_parallel`, `resume`
- [ ] 9.2 Implement `run()` method wiring all phases in sequence with the main loop, time limit check, score threshold check, and cooldown
- [ ] 9.3 Implement lock file management (create on start, cleanup on exit via `atexit` and signal handlers)
- [ ] 9.4 Implement logging system with level-based formatting matching bash output

## 10. CLI Entry Point

- [ ] 10.1 Implement `__main__.py` with `argparse` for `run` subcommand with all flags (`--project`, `--max-hours`, `--threshold`, `--max-parallel`, `--resume`)
- [ ] 10.2 Wire CLI to `HarnessRunner` — parse args, load config, instantiate runner, call `asyncio.run(runner.run())`
- [ ] 10.3 Add `--help` output matching the bash version's help text

## 11. Integration Testing

- [ ] 11.1 Write end-to-end test: run Python harness for 1 iteration on test fixtures, verify `state.json` is updated correctly
- [ ] 11.2 Write comparison test: run both bash and Python harness on same initial state, compare resulting `state.json` and eval scores
- [ ] 11.3 Verify interoperability: start with bash for iteration 1, switch to Python for iteration 2, confirm state continuity

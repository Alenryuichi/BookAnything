## Why

`run.sh` is 1,228 lines of bash that orchestrates a 7-phase loop (Plan → Write → Improve → Review → Build → Visual Test → Evaluate) by shelling out to the Claude CLI. The bash approach has reached its maintainability ceiling: heredoc prompt templates lack dynamic logic, JSON output cleaning relies on fragile regex extraction (`{` to `}`), parallel chapter writing uses raw `&`/`wait` with no structured error handling, and the evaluation phase embeds scoring formulas in deeply nested arithmetic expressions. Adding features like retry logic, streaming, conditional tool selection, or structured error messages requires fighting the language at every turn. Migrating orchestration to Python with the Claude Agent SDK eliminates these pain points and unlocks a proper typed, async, testable architecture.

## What Changes

- **New Python harness package** (`harness/`) with a `HarnessRunner` class exposing `plan()`, `write_chapter()`, `improve_webapp()`, `evaluate()`, `build_site()`, `visual_test()` methods
- **Pydantic models** for all JSON schemas: plan output, chapter JSON, evaluation scores, state file — replacing ad-hoc `jq` construction and sed-based cleaning
- **Claude Agent SDK integration** replacing raw `claude -p` CLI calls with the SDK's `Claude` client, gaining structured output, tool management, retry/timeout, and streaming
- **Async parallel execution** for chapter writing via `asyncio.gather()` with configurable concurrency, replacing `&`/`wait` background processes
- **Deterministic evaluation in Python** porting the bash arithmetic (`eval_content`, `eval_visual`, `eval_interaction`, `merge_scores`) to typed Python functions with the same formulas
- **CLI entry point** via `python -m harness run --project projects/pydantic-ai.yaml` with the same flags as `run.sh`
- **`run.sh` preserved** as fallback — both harnesses read/write the same `state.json` and chapter files
- **No changes** to `.claude/` capability layer, `projects/*.yaml` configs, `goals.yaml`, chapter JSON schema, or `web-app/`

## Capabilities

### New Capabilities
- `python-orchestrator`: Python-based orchestration engine (`HarnessRunner`) that drives the plan→write→improve→review→build→test→evaluate loop using the Claude Agent SDK
- `structured-schemas`: Pydantic models defining typed contracts for plan output, chapter JSON, evaluation results, and harness state
- `async-execution`: Async parallel chapter writing with configurable concurrency limits and structured error propagation
- `deterministic-eval`: Python port of the bash evaluation formulas (content/visual/interaction scoring) preserving identical scoring semantics

### Modified Capabilities
<!-- No existing specs to modify — the openspec/specs/ directory is empty -->

## Impact

- **Code**: New `harness/` Python package alongside existing `run.sh`. Shared artifacts: `state.json`, `knowledge/*/chapters/*.json`, `output/` logs/screenshots
- **Dependencies**: Adds `claude-agent-sdk`, `pydantic`, `pyyaml`, `asyncio` (stdlib). Requires Python 3.11+
- **APIs**: Same CLI surface (`--project`, `--max-hours`, `--threshold`, `--max-parallel`, `--resume`) but via `python -m harness`
- **Migration**: Incremental — start with `evaluate()` (deterministic, easiest to verify), then `plan()`, then `write_chapter()`, then remaining phases. Bash fallback stays until full parity is confirmed
- **Risk**: Score drift between Python and bash eval implementations must be caught by comparison tests during migration

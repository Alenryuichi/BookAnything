## 1. Repo Scanner

- [ ] 1.1 Create `pyharness/init.py` with `scan_repo(repo_path: Path)` function: infer project name from `package.json` / `Cargo.toml` / `go.mod` / dirname
- [ ] 1.2 Implement `detect_source_dir(repo_path)`: check for `src`, `lib`, `packages`, `app`, `cmd`, `internal` in order
- [ ] 1.3 Implement `detect_language(scan_path)`: count files by extension using `EXTENSION_MAP`, return top language
- [ ] 1.4 Implement `collect_stats(scan_path)`: count files and sum line counts, excluding `node_modules/.git/dist/__pycache__`
- [ ] 1.5 Implement `collect_dir_tree(scan_path, max_depth=2, limit=80)`: sorted directory listing

## 2. Chapter Planner

- [ ] 2.1 Implement `build_planning_prompt(scan_result)`: construct the Chinese-language prompt identical to `new-project.sh`'s Phase 2
- [ ] 2.2 Implement `plan_chapters(repo_path, scan_result) -> dict`: call `ClaudeClient(cwd=repo_path).run()` with the prompt, extract JSON
- [ ] 2.3 Implement `extract_json_from_response(text) -> dict | None`: strip `</think>`, find outermost `{...}`, parse
- [ ] 2.4 Implement fallback skeleton generation when Claude fails: `ch01-introduction` + one chapter per top-level directory (max 12)

## 3. YAML Generator

- [ ] 3.1 Implement `generate_yaml(scan_result, plan_result, output_dir) -> Path`: build the YAML string with Part comments
- [ ] 3.2 Ensure output is round-trippable: `load_project_config(path)` succeeds on generated YAML
- [ ] 3.3 Use Claude-inferred `project_name` when available, else filesystem name

## 4. CLI Integration

- [ ] 4.1 Add `init` subparser to `__main__.py` with required `repo_path` positional argument
- [ ] 4.2 Wire `init` command to `async def init_project(repo_path)` in `pyharness/init.py`
- [ ] 4.3 Add user-facing output: print scan results, progress, final YAML path (match bash UX)

## 5. Tests

- [ ] 5.1 `tests/test_init.py`: test `scan_repo` with a temporary directory tree (infer name, language, stats)
- [ ] 5.2 Test `detect_language` with various file distributions
- [ ] 5.3 Test `extract_json_from_response` with clean JSON, think-prefix, markdown-wrapped, invalid input
- [ ] 5.4 Test `generate_yaml` output round-trips through `load_project_config`
- [ ] 5.5 Test fallback skeleton generation produces valid YAML

## 6. Cleanup

- [ ] 6.1 Delete `new-project.sh`
- [ ] 6.2 Update `run.sh` if it references `new-project.sh` (remove or redirect)
- [ ] 6.3 Update README / CLAUDE.md if they reference `bash new-project.sh`

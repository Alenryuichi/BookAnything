## ADDED Requirements

### Requirement: Project settings file exists
The system SHALL have a `.claude/settings.json` that registers all hooks and project defaults. The file MUST be valid JSON and MUST be loadable by Claude Code CLI when `claude -p` is invoked from the `harness/` directory.

#### Scenario: Settings loaded in headless mode
- **WHEN** `claude -p "test"` is invoked from `harness/` without `--bare`
- **THEN** the CLI loads `.claude/settings.json` and registers all declared hooks

### Requirement: Git safety rule
The system SHALL have `.claude/rules/git-safety.md` that prohibits `git push`, `git reset`, `git rebase`, `git checkout -f`, and `git branch -D`. Only `git status`, `git log`, and `git diff` (read-only) SHALL be allowed.

#### Scenario: Git write operation blocked
- **WHEN** the model attempts to run `git push` via Bash tool
- **THEN** the PreToolUse hook denies the operation with a reason citing git-safety rule

### Requirement: Chapter JSON contract rule
The system SHALL have `.claude/rules/chapter-json-contract.md` that defines: output MUST be pure JSON (no markdown fences), MUST contain `chapter_id`, `title`, `sections` (array), `key_takeaways` (array), and `word_count` (number between 3000-5000).

#### Scenario: JSON contract referenced during chapter writing
- **WHEN** the model is generating a chapter JSON
- **THEN** the rule is available as project context defining the required output structure

### Requirement: Path boundaries rule
The system SHALL have `.claude/rules/path-boundaries.md` that restricts write operations to `knowledge/`, `web-app/`, `output/`, and `openspec/`. Writes to the target source code repository SHALL be prohibited.

#### Scenario: Write outside boundaries blocked
- **WHEN** the model attempts to write a file outside the allowed directories
- **THEN** the PreToolUse hook denies the operation

### Requirement: Repo layout rule
The system SHALL have `.claude/rules/repo-layout.md` that documents the directory structure: `projects/` (YAML configs), `prompts/` (legacy templates), `knowledge/` (generated chapters), `output/` (logs/screenshots), `web-app/` (Next.js site), `scripts/` (utilities).

#### Scenario: Layout information available
- **WHEN** the model needs to understand where files belong
- **THEN** the repo-layout rule provides authoritative directory descriptions

### Requirement: Workflow glossary rule
The system SHALL have `.claude/rules/workflow-glossary.md` that defines: iteration, chapter, score (content/visual/interaction), threshold, knowledge project, plan/write/improve/review/build/test/eval phases, and `state.json` fields.

#### Scenario: Terminology consistent
- **WHEN** the model references harness concepts
- **THEN** the glossary provides canonical definitions

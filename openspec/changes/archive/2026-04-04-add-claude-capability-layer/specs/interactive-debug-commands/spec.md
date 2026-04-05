## ADDED Requirements

### Requirement: Harness status command
The system SHALL have `.claude/commands/harness-status.md` that displays: current `state.json` contents (iteration, score, phase, dimensional scores), recent log entries from `output/logs/harness.log`, lock file status, and chapter count. This command SHALL only be available in interactive Claude sessions.

#### Scenario: Status command in interactive session
- **WHEN** a user types `/harness-status` in an interactive Claude session
- **THEN** the command displays current harness state, recent logs, and chapter counts

### Requirement: Verify JSON command
The system SHALL have `.claude/commands/harness-verify-json.md` that accepts a chapter file path as `$ARGUMENTS`, reads the file, validates it is parseable JSON, and checks for required fields (`chapter_id`, `title`, `sections`, `key_takeaways`, `word_count`). This command SHALL only be available in interactive Claude sessions.

#### Scenario: Verify valid chapter
- **WHEN** a user types `/harness-verify-json knowledge/ProjectName/chapters/ch01.json`
- **THEN** the command reports all required fields present and valid

#### Scenario: Verify invalid chapter
- **WHEN** a user types `/harness-verify-json` with a path to a malformed JSON file
- **THEN** the command reports specific validation errors

### Requirement: OpenSpec commands migrated from skills
The system SHALL move the 4 existing openspec skills (`openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`) from `.claude/skills/` to `.claude/commands/`. This ensures they are available in interactive sessions (via `/opsx:propose` etc.) but do NOT auto-load in headless `claude -p` runs.

#### Scenario: OpenSpec commands available in interactive session
- **WHEN** a maintainer types `/openspec-propose` in an interactive Claude session
- **THEN** the command is available and functions identically to the former skill

#### Scenario: OpenSpec commands absent from headless runs
- **WHEN** `claude -p` is invoked for chapter writing or evaluation
- **THEN** no openspec-related context is loaded into the model

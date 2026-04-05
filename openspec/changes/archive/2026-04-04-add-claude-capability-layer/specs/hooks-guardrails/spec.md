## ADDED Requirements

### Requirement: PreToolUse path and command guard
The system SHALL have a PreToolUse hook registered in `settings.json` matching `Edit|Write|Bash` tools. The hook MUST deny writes outside allowed directories (`knowledge/`, `web-app/`, `output/`, `openspec/`). The hook MUST deny Bash commands matching dangerous git patterns (`git push`, `git reset`, `git rebase`, `git checkout.*-f`, `git branch.*-D`).

#### Scenario: Write to forbidden path denied
- **WHEN** the model attempts `Write` to a path not under `knowledge/`, `web-app/`, `output/`, or `openspec/`
- **THEN** the hook returns exit code 2 with JSON `{"decision": "deny", "reason": "..."}`

#### Scenario: Dangerous git command denied
- **WHEN** the model attempts `Bash` with `git push origin main`
- **THEN** the hook returns exit code 2 with JSON `{"decision": "deny", "reason": "..."}`

#### Scenario: Safe write allowed
- **WHEN** the model writes to `knowledge/Pydantic AI/chapters/ch01.json`
- **THEN** the hook exits 0 (allow)

### Requirement: PostToolUse JSON validation
The system SHALL have a PostToolUse hook registered in `settings.json` matching `Edit|Write` tools for paths containing `knowledge/` and ending in `.json`. The hook MUST verify the written file is valid JSON via `jq empty`. The hook MUST check for required fields: `chapter_id`, `title`, `sections`.

#### Scenario: Valid chapter JSON accepted
- **WHEN** a valid chapter JSON is written to `knowledge/*/chapters/*.json`
- **THEN** the hook exits 0

#### Scenario: Invalid JSON triggers feedback
- **WHEN** an invalid JSON file is written to `knowledge/*/chapters/*.json`
- **THEN** the hook returns JSON with `{"decision": "block", "reason": "Invalid JSON: ..."}`

### Requirement: SessionStart compact context injection
The system SHALL have a SessionStart hook that activates after context compaction. The hook MUST output key constraints (pure JSON output, path boundaries, current project name) as `additionalContext`. The injected context MUST NOT exceed 10000 characters.

#### Scenario: Context reinjected after compact
- **WHEN** a session compaction occurs
- **THEN** the hook injects project constraints into the session via stdout JSON with `additionalContext`

### Requirement: Subagent activity logger
The system SHALL have SubagentStart and SubagentStop hooks. On start, the hook MUST log `agent_id`, `agent_type`, and timestamp. On stop, the hook MUST log `agent_id`, `agent_type`, `agent_transcript_path`, and timestamp. Logs MUST be appended to `output/logs/subagent-activity.log`.

#### Scenario: Subagent lifecycle logged
- **WHEN** a subagent starts and then stops
- **THEN** two log lines are appended to `output/logs/subagent-activity.log` with timestamps and agent metadata

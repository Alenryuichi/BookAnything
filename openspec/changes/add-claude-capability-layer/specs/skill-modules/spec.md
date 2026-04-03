## ADDED Requirements

### Requirement: Harness plan skill
The system SHALL have `.claude/skills/harness-plan/SKILL.md` that defines the planning phase capability. The skill MUST describe: input (state.json, goals, existing chapters), output (plan JSON with `chapters_to_write`, `needs_webapp_improve`, `improvement_focus`), and allowed tools (Read, Glob, Grep only).

#### Scenario: Plan skill auto-activates
- **WHEN** the model is asked to plan the next iteration of chapter writing
- **THEN** the harness-plan skill is available as context for producing a valid plan JSON

### Requirement: Harness write-chapter skill
The system SHALL have `.claude/skills/harness-write-chapter/SKILL.md` that defines the chapter writing capability. The skill MUST describe: input (chapter_id, sources, outline from project YAML), output (chapter JSON matching the contract in `rules/chapter-json-contract.md`), writing methodology (70% text / 30% code, opening hook, comparisons, mermaid diagrams), and allowed tools (Read, Glob, Grep only).

#### Scenario: Write-chapter skill produces valid JSON
- **WHEN** the model writes a chapter using this skill's guidance
- **THEN** the output is a JSON object with all required fields from the chapter contract

### Requirement: Harness evaluate skill
The system SHALL have `.claude/skills/harness-evaluate/SKILL.md` that defines the evaluation capability. The skill MUST describe: three dimensions (content/40, visual/35, interaction/25), input (chapter summaries, screenshot report, visual test metrics), and output (eval JSON with `score`, `scores`, `issues`, `suggestions`).

#### Scenario: Evaluate skill produces scored output
- **WHEN** the model evaluates the current book state
- **THEN** the output is a JSON object with dimensional scores summing to max 100

### Requirement: Harness webapp-review skill
The system SHALL have `.claude/skills/harness-webapp-review/SKILL.md` that defines the webapp improvement capability. The skill MUST describe: input (evaluation feedback, screenshot report), output (improvement JSON with `changes_made`, `files_modified`, `issues_fixed`), constraints (only modify `web-app/` files), and allowed tools (Read, Glob, Grep, Write, Edit).

#### Scenario: Webapp-review skill respects path constraint
- **WHEN** the model uses this skill to fix the web app
- **THEN** all file modifications are within the `web-app/` directory

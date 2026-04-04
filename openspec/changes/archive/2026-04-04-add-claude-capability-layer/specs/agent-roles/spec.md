## ADDED Requirements

### Requirement: Planner agent
The system SHALL have `.claude/agents/planner.md` that defines a read-only subagent for planning. The agent MUST restrict tools to Read, Glob, Grep. The agent MUST output plan JSON only.

#### Scenario: Planner agent cannot write files
- **WHEN** the planner agent is invoked
- **THEN** it has no access to Write, Edit, or Bash tools

### Requirement: Chapter writer agent
The system SHALL have `.claude/agents/chapter-writer.md` that defines a subagent for chapter generation. The agent MUST restrict tools to Read, Glob, Grep. The agent MUST output chapter JSON conforming to the chapter contract.

#### Scenario: Chapter writer agent reads source code
- **WHEN** the chapter writer agent is generating content
- **THEN** it can read files from the target source repository via Read/Glob/Grep

### Requirement: Evaluator agent
The system SHALL have `.claude/agents/evaluator.md` that defines a read-only subagent for evaluation. The agent MUST restrict tools to Read, Glob, Grep. The agent MUST output evaluation JSON with dimensional scores.

#### Scenario: Evaluator agent reads screenshots
- **WHEN** the evaluator agent is scoring visual quality
- **THEN** it can read screenshot files from `output/screenshots/`

### Requirement: Webapp reviewer agent
The system SHALL have `.claude/agents/webapp-reviewer.md` that defines a subagent with write access limited to `web-app/`. The agent MUST restrict tools to Read, Glob, Grep, Write, Edit. The agent MUST NOT modify files outside `web-app/`.

#### Scenario: Webapp reviewer modifies only web-app
- **WHEN** the webapp reviewer agent fixes issues
- **THEN** all Write/Edit operations target paths within `web-app/`

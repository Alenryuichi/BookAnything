## ADDED Requirements

### Requirement: Build planning prompt from scan results
The system SHALL construct a Chinese-language prompt containing: project name, language, repo path, file/line stats, directory stats, directory tree. The prompt SHALL instruct Claude to explore source code and output a JSON object with `parts` and `chapters`.

#### Scenario: Prompt includes all scan data
- **WHEN** scan reports project "React", language "TypeScript", 5000 files, 1.2M lines
- **THEN** the prompt contains all of these values and requests a JSON response with `parts[].chapters[]`

### Requirement: Call ClaudeClient for chapter planning
The system SHALL use `ClaudeClient(cwd=repo_path).run(prompt, max_turns=30)` to invoke Claude for chapter analysis. The `cwd` MUST be set to the target repo so Claude can use Read/Glob/Grep tools on the source.

#### Scenario: Successful Claude response
- **WHEN** Claude returns valid JSON with a `parts` array
- **THEN** the system uses the parsed JSON for YAML generation

### Requirement: Extract JSON from Claude response
The system SHALL parse the Claude response as JSON. If direct parsing fails, it SHALL:
1. Strip `</think>` prefix if present
2. Find the outermost `{...}` substring
3. Attempt `json.loads` on the extracted substring

#### Scenario: Response wrapped in markdown
- **WHEN** Claude response starts with "```json\n{...}\n```"
- **THEN** the JSON is still successfully extracted

#### Scenario: Response has think prefix
- **WHEN** Claude response starts with `<think>...</think>{...}`
- **THEN** the `</think>` prefix is stripped and JSON is parsed

### Requirement: Fallback skeleton when Claude fails
When the Claude response cannot be parsed as valid JSON with `parts`, the system SHALL generate a fallback skeleton:
- `ch01-introduction` chapter with generic outline
- One chapter per top-level directory in the source directory (up to 12)

#### Scenario: Claude returns invalid response
- **WHEN** Claude returns prose instead of JSON
- **THEN** the system generates a fallback YAML with `ch01-introduction` plus one chapter per source directory

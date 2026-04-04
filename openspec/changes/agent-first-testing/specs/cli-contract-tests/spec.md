## ADDED Requirements

### Requirement: CLI argv assembly is correct
The test suite SHALL verify that `ClaudeClient.run()` passes the correct arguments to `asyncio.create_subprocess_exec`: the command name (from `CLAUDE_CMD` env var or default `claude`), `-p`, the prompt, `--output-format json`, `--max-turns`, and `--allowedTools` when specified.

#### Scenario: Default invocation
- **WHEN** `ClaudeClient.run(prompt="test", allowed_tools=["Read","Grep"])` is called
- **THEN** the subprocess args SHALL include `["claude", "-p", "test", "--output-format", "json", "--max-turns", "30", "--allowedTools", "Read,Grep"]`

#### Scenario: Custom command from environment
- **WHEN** `CLAUDE_CMD=claude-internal` is set and `ClaudeClient` is instantiated
- **THEN** the subprocess args SHALL start with `"claude-internal"` instead of `"claude"`

#### Scenario: No allowed tools
- **WHEN** `allowed_tools` is None
- **THEN** the subprocess args SHALL NOT include `--allowedTools`

### Requirement: JSON output parsing handles variants
The test suite SHALL verify that `_extract_json()` correctly handles: pure JSON, markdown-fenced JSON (```json ... ```), JSON with prose prefix, JSON with prose suffix, nested `{...}` objects, empty input, and non-JSON input.

#### Scenario: Pure JSON
- **WHEN** input is `'{"score": 42}'`
- **THEN** the function SHALL return `'{"score": 42}'`

#### Scenario: Markdown fenced
- **WHEN** input is `'```json\n{"score": 42}\n```'`
- **THEN** the function SHALL return `'{"score": 42}'`

#### Scenario: Prose prefix
- **WHEN** input is `'Here is the result:\n{"score": 42}'`
- **THEN** the function SHALL return `'{"score": 42}'`

#### Scenario: Empty or non-JSON
- **WHEN** input is `''` or `'no json here'`
- **THEN** the function SHALL return `None`

### Requirement: Response model validation
The test suite SHALL verify that when `response_model` is provided, the parsed JSON is validated against the Pydantic model and raises `ValueError` for invalid data.

#### Scenario: Valid response model
- **WHEN** CLI returns `{"plan_summary":"test","chapters_to_write":[]}` and `response_model=PlanOutput`
- **THEN** the result SHALL be a `PlanOutput` instance

#### Scenario: Invalid response for model
- **WHEN** CLI returns `{"invalid": "data"}` that doesn't match the model
- **THEN** `run()` SHALL raise `ValueError` or `ValidationError`

### Requirement: Error handling
The test suite SHALL verify that non-zero exit codes from the CLI raise `RuntimeError` with the stderr content.

#### Scenario: CLI exits with error
- **WHEN** the subprocess returns exit code 1 with stderr "auth failed"
- **THEN** `run()` SHALL raise `RuntimeError` containing "auth failed"

### Requirement: Timeout enforcement
The test suite SHALL verify that `asyncio.wait_for` is used with the configured timeout.

#### Scenario: Slow response
- **WHEN** the subprocess does not complete within the timeout
- **THEN** `run()` SHALL raise `asyncio.TimeoutError`

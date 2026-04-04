## ADDED Requirements

### Requirement: CLI response fixtures exist
The test suite SHALL include recorded JSON fixtures from real Claude CLI invocations stored in `tests/fixtures/`.

#### Scenario: Plan response fixture
- **WHEN** `tests/fixtures/cli_plan_response.json` is loaded
- **THEN** it SHALL be valid JSON matching the `{"type":"result","result":"..."}` envelope format

#### Scenario: Chapter response fixture
- **WHEN** `tests/fixtures/cli_chapter_response.json` is loaded
- **THEN** it SHALL be valid JSON and the inner `result` SHALL parse as a chapter-like object

### Requirement: Fixtures used in client tests
The test suite SHALL use recorded fixtures as mock subprocess stdout to verify the full parsing pipeline (envelope extraction + JSON cleaning + optional model validation).

#### Scenario: Parse plan from real fixture
- **WHEN** mock subprocess returns the plan fixture content
- **THEN** `ClaudeClient.run(response_model=PlanOutput)` SHALL return a valid `PlanOutput` instance

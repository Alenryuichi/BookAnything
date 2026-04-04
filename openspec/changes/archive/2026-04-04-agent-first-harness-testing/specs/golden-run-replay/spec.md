## ADDED Requirements

### Requirement: Golden run recording from real harness output
The test suite SHALL include recorded Claude CLI responses extracted from real `output/logs/*.raw.json` files, stored as fixtures in `tests/agent_fixtures/golden_run/`.

#### Scenario: Fixture contains valid envelope
- **WHEN** `golden_run/plan_response.json` is loaded
- **THEN** it SHALL be valid JSON with a `result` field containing parseable plan data

### Requirement: Replay pipeline produces consistent scores
The test suite SHALL mock `create_subprocess_exec` to return golden run fixtures, run the eval pipeline on the resulting artifacts, and verify the score matches the recorded score within a tolerance of 0.

#### Scenario: Replay plan + eval produces same score
- **WHEN** the golden plan response is replayed through ClaudeClient and eval runs on existing chapters
- **THEN** the eval score SHALL equal the score computed from the same chapter data without replay

### Requirement: JSON cleaning resilience across refactors
The test suite SHALL verify that the `_extract_json()` function and `ClaudeClient.run()` pipeline produce identical parsed output from golden fixtures after code changes.

#### Scenario: Refactored parser produces same result
- **WHEN** golden chapter response is parsed by current `ClaudeClient.run()`
- **THEN** the extracted JSON SHALL be identical to a stored expected-output fixture

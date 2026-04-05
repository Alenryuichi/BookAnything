## ADDED Requirements

### Requirement: Single iteration E2E with real Claude
The test suite SHALL include a `@pytest.mark.slow` test that runs 1 iteration of the Python harness with real Claude CLI, verifying the pipeline doesn't crash.

#### Scenario: One iteration completes
- **WHEN** `HarnessRunner.run()` executes with `max_hours=0.01` and real Claude CLI
- **THEN** state.json SHALL have iteration >= 1 and score > 0

### Requirement: Chapter artifact produced
The E2E test SHALL verify that at least one chapter JSON file exists in `knowledge/` after the iteration.

#### Scenario: Chapter written
- **WHEN** the harness completes 1 iteration with chapters to write
- **THEN** at least one `.json` file SHALL exist in the chapters directory

### Requirement: No regression from code changes
The E2E test serves as a smoke test — if the harness crashes after a code change, this test catches it before deployment.

#### Scenario: Smoke test after refactor
- **WHEN** code is refactored and `pytest -m slow` is run
- **THEN** the harness SHALL complete 1 iteration without uncaught exceptions

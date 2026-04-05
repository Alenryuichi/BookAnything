## ADDED Requirements

### Requirement: HarnessRunner class orchestrates the generation loop
The system SHALL provide a `HarnessRunner` class that drives the 7-phase loop (Plan → Write → Improve → Review → Build → Visual Test → Evaluate) with the same semantics as the bash `main()` function in `run.sh`.

#### Scenario: Full loop execution
- **WHEN** `HarnessRunner.run()` is called with a valid project config
- **THEN** the runner SHALL execute phases 1-7 in sequence, updating `state.json` after each evaluation, and terminate when the score meets the threshold or the time limit is reached

#### Scenario: Resume from previous state
- **WHEN** `HarnessRunner.run()` is called with `resume=True` and a valid `state.json` exists
- **THEN** the runner SHALL load the existing state and continue from the last recorded iteration number

#### Scenario: Time limit enforcement
- **WHEN** the elapsed time exceeds `max_hours`
- **THEN** the runner SHALL stop the loop, perform a final build, and exit gracefully

### Requirement: CLI entry point mirrors run.sh flags
The system SHALL provide a CLI entry point at `python -m harness` that accepts the same flags as `run.sh`: `--project`, `--max-hours`, `--threshold`, `--max-parallel`, `--resume`.

#### Scenario: Default project config
- **WHEN** the CLI is invoked without `--project`
- **THEN** the system SHALL use `projects/claude-code.yaml` as the default project configuration

#### Scenario: All flags accepted
- **WHEN** the CLI is invoked with `--project projects/pydantic-ai.yaml --max-hours 8 --threshold 90 --max-parallel 4 --resume`
- **THEN** each flag SHALL be parsed and passed to `HarnessRunner` with the corresponding values

### Requirement: Lock file prevents concurrent execution
The system SHALL use a `.harness.lock` file to prevent multiple harness instances from running simultaneously, matching the bash lock file behavior.

#### Scenario: Lock file exists with running process
- **WHEN** a `.harness.lock` file exists and the recorded PID is still alive
- **THEN** the system SHALL exit with an error message including the PID

#### Scenario: Lock file cleanup on exit
- **WHEN** the harness exits (normally or via signal)
- **THEN** the system SHALL remove the `.harness.lock` file

### Requirement: Phase-level error handling with continuation
Each phase SHALL catch and log errors without crashing the loop, matching the bash behavior where failures in non-critical phases (improve, review, visual test) log warnings and continue.

#### Scenario: Non-critical phase failure
- **WHEN** `step_improve_webapp` or `step_code_review` or `step_visual_test` raises an exception
- **THEN** the runner SHALL log the error as a warning and continue to the next phase

#### Scenario: Evaluation failure
- **WHEN** `step_evaluate` raises an exception
- **THEN** the runner SHALL update state with `phase: "eval_failed"` and continue to the next iteration

### Requirement: YAML config loading with validation
The system SHALL load project configuration from YAML files (`projects/*.yaml`) and validate required fields (`name`, `repo_path`, `target_dir`, `language`, `book.title`, `chapters`).

#### Scenario: Valid project config
- **WHEN** a valid YAML project file is loaded
- **THEN** the system SHALL parse all fields and make them available as typed attributes

#### Scenario: Missing required field
- **WHEN** a YAML project file is missing a required field
- **THEN** the system SHALL raise a clear validation error naming the missing field

### Requirement: Logging matches bash output format
The system SHALL provide structured logging with level-based formatting (INFO, OK, WARN, ERROR, STEP, HEAD) and write to both stdout and `output/logs/harness.log`.

#### Scenario: Log entry format
- **WHEN** a log message is emitted at any level
- **THEN** the output SHALL include a timestamp and level indicator, and the message SHALL be appended to the log file

### Requirement: Git checkpoint after each iteration
The system SHALL auto-commit changes after each scored iteration, matching the bash `step_checkpoint` behavior.

#### Scenario: Checkpoint after evaluation
- **WHEN** an iteration completes with a valid score
- **THEN** the system SHALL stage changed files in `knowledge/` and `web-app/` and create a git commit with the iteration number and score in the message

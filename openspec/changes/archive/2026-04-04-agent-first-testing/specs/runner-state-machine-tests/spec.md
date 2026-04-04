## ADDED Requirements

### Requirement: Phase execution order
The test suite SHALL verify that `HarnessRunner.run()` executes phases in order: Plan -> Write -> Improve (conditional) -> Review -> Build -> Visual Test -> Evaluate.

#### Scenario: Normal iteration
- **WHEN** all phases succeed and plan has `needs_webapp_improve=True`
- **THEN** all 7 phases SHALL execute in order

#### Scenario: Skip improve when not needed
- **WHEN** plan has `needs_webapp_improve=False`
- **THEN** Phase 3 (Improve) SHALL be skipped

#### Scenario: Skip write when no chapters
- **WHEN** plan returns empty `chapters_to_write`
- **THEN** Phase 2 (Write) SHALL log warning and continue

### Requirement: Score threshold stop
The test suite SHALL verify that the runner stops when the evaluation score meets or exceeds the threshold.

#### Scenario: Score meets threshold
- **WHEN** eval returns score 85 and threshold is 85
- **THEN** the runner SHALL log "Target reached" and break the loop

#### Scenario: Score below threshold
- **WHEN** eval returns score 70 and threshold is 85
- **THEN** the runner SHALL continue to the next iteration

### Requirement: Time limit stop
The test suite SHALL verify that the runner stops when elapsed time exceeds max_hours.

#### Scenario: Time exceeded
- **WHEN** elapsed time exceeds `max_hours`
- **THEN** the runner SHALL log "Time limit reached" and break the loop

### Requirement: Phase error resilience
The test suite SHALL verify that failures in non-critical phases (improve, review, visual test) are logged as warnings and do not crash the loop.

#### Scenario: Improve phase fails
- **WHEN** `step_improve_webapp` raises an exception
- **THEN** the runner SHALL log "WARN" and continue to Review phase

#### Scenario: Eval phase fails
- **WHEN** `step_evaluate` raises an exception
- **THEN** the runner SHALL update state with `phase: "eval_failed"` and continue

### Requirement: Lock file lifecycle
The test suite SHALL verify lock file creation on start, rejection when another instance holds the lock, and cleanup on exit.

#### Scenario: Lock acquired
- **WHEN** no lock file exists
- **THEN** `_acquire_lock()` SHALL create `.harness.lock` with the current PID

#### Scenario: Lock already held
- **WHEN** `.harness.lock` exists with a PID of a running process
- **THEN** `_acquire_lock()` SHALL raise `RuntimeError`

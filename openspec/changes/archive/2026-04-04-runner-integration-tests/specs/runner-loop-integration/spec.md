## ADDED Requirements

### Requirement: All 7 phases execute in order
The test SHALL verify that `runner.run()` calls Plan, Write, Improve, Review, Build, VisualTest, and Eval in sequence within a single iteration.

#### Scenario: Normal iteration with improve enabled
- **WHEN** plan returns `needs_webapp_improve=True` and eval score meets threshold
- **THEN** the call order SHALL be [plan, write, improve, review, build, visual_test, eval, checkpoint]

### Requirement: Improve phase conditionally skipped
The test SHALL verify that Phase 3 is skipped when `plan.needs_webapp_improve` is False.

#### Scenario: Skip improve
- **WHEN** plan returns `needs_webapp_improve=False`
- **THEN** "improve" SHALL NOT appear in the call order

### Requirement: Score threshold stops the loop
The test SHALL verify that when eval score >= threshold, the loop breaks after the current iteration.

#### Scenario: Score meets threshold
- **WHEN** eval returns score 90 and threshold is 85
- **THEN** `runner.run()` SHALL complete with exactly 1 iteration

### Requirement: Time limit stops the loop
The test SHALL verify that when elapsed time > max_hours, the loop exits before starting a new iteration.

#### Scenario: Time exceeded
- **WHEN** time.time() is mocked to simulate max_hours elapsed
- **THEN** the loop SHALL break and final build SHALL execute

### Requirement: Non-critical phase errors don't crash
The test SHALL verify that exceptions in improve, review, build, and visual_test phases are caught and logged, and the loop continues.

#### Scenario: Improve throws exception
- **WHEN** step_improve_webapp raises RuntimeError
- **THEN** review, build, visual_test, and eval SHALL still execute

### Requirement: State updated after eval
The test SHALL verify that `state.json` is updated with the new iteration number and score after eval completes.

#### Scenario: State reflects eval result
- **WHEN** eval completes with score 90
- **THEN** state.json SHALL have iteration=1, score=90, phase="evaluated"

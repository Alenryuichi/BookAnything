## ADDED Requirements

### Requirement: Content score computation matches bash formula
The system SHALL compute content scores using the same formula as `eval_content()` in `run.sh`: coverage (15 pts) = `chapters_written * 15 / total_chapters`, volume (15 pts) = `qualifying_chapters * 15 / chapters_written` where qualifying means `file_size > 10240 AND sections >= 4`, depth (10 pts) = `depth_a + depth_b` where depth_a (5 pts) = `(word_count >= 3000 AND sections >= 4) count * 5 / chapters_written` and depth_b (5 pts) = `(sections >= 5) count * 5 / chapters_written`. Total content = coverage + volume + depth (max 40).

#### Scenario: Score parity with bash on real data
- **WHEN** the Python `eval_content()` is run on the same chapter files as the bash version
- **THEN** the computed content score SHALL be identical (integer equality) to the bash output

#### Scenario: Zero chapters handled
- **WHEN** no chapter files exist in the chapters directory
- **THEN** the content score SHALL be 0 and no division-by-zero error SHALL occur

#### Scenario: Partial coverage
- **WHEN** 3 out of 10 chapters are written, all qualifying for volume and depth
- **THEN** coverage SHALL be `3 * 15 / 10 = 4` (integer division), volume SHALL be 15, depth SHALL be 10, total SHALL be 29

### Requirement: Visual score computation matches bash formula
The system SHALL compute visual scores using the same formula as `eval_visual()` in `run.sh`: build_score (10 pts) based on `out/` directory existence, error_score (10 pts) based on console error count, mermaid_score (5 pts) based on rendered vs error ratio, layout_score (10 pts) based on sidebar/dark-mode/card-count/body-text metrics from `report.json`.

#### Scenario: Score parity with bash on real data
- **WHEN** the Python `eval_visual()` is run with the same `report.json` and build artifacts as the bash version
- **THEN** the computed visual score SHALL be identical to the bash output

#### Scenario: Missing screenshot report
- **WHEN** `output/screenshots/report.json` does not exist
- **THEN** the system SHALL compute visual score using only the build_score component (other components default to 0)

### Requirement: Interaction score computation matches bash formula
The system SHALL compute interaction scores using the same formula as `eval_interaction()` in `run.sh`: navigation (10 pts), code_blocks (5 pts), search (5 pts), responsive (5 pts) — all derived from metrics in `report.json`.

#### Scenario: Score parity with bash on real data
- **WHEN** the Python `eval_interaction()` is run with the same `report.json` as the bash version
- **THEN** the computed interaction score SHALL be identical to the bash output

### Requirement: Score merging matches bash merge_scores
The system SHALL merge dimension scores into a final evaluation JSON using the same structure as `merge_scores()` in `run.sh`: `{ score, scores: {total, content, visual, interaction}, content: {...}, visual: {...}, interaction: {...} }`.

#### Scenario: Merge output format
- **WHEN** all three dimension scores are computed
- **THEN** the merged result SHALL contain the total score as the sum of the three dimensions, and each dimension's breakdown, issues, and suggestions

### Requirement: Evaluation generates issues and suggestions
Each evaluation function SHALL generate `issues` (list of problem descriptions) and `suggestions` (list of actionable improvement hints) using the same threshold conditions as the bash version.

#### Scenario: Low coverage generates issue
- **WHEN** coverage score is below 15 (maximum)
- **THEN** the content evaluation SHALL include an issue stating the coverage ratio and a suggestion to continue writing chapters

#### Scenario: High scores generate no issues
- **WHEN** all dimension scores are at or near maximum
- **THEN** the issues list SHALL be empty

### Requirement: Evaluation uses only filesystem data
The evaluation functions SHALL be purely deterministic, reading only from the filesystem (chapter JSON files, `report.json`, build artifacts) with no Claude API calls.

#### Scenario: No API calls during evaluation
- **WHEN** `step_evaluate()` is called
- **THEN** the system SHALL NOT make any Claude Agent SDK calls — all scores are computed from local files using arithmetic formulas

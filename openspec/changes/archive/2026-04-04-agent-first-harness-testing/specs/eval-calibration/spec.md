## ADDED Requirements

### Requirement: High-quality chapter scores above threshold
The test suite SHALL include a known high-quality chapter fixture (>15KB, 5+ sections, word_count >= 3500) and verify that `eval_content` scores it above 30/40 when it is the only chapter of 1 total.

#### Scenario: Good chapter gets high content score
- **WHEN** eval_content runs on a directory containing only the high-quality fixture
- **THEN** the score SHALL be >= 30 with coverage=15, volume=15, depth >= 5

### Requirement: Low-quality chapter scores below threshold
The test suite SHALL include a known low-quality chapter fixture (<3KB, 1-2 sections, word_count < 1000) and verify that `eval_content` scores it below 20/40.

#### Scenario: Bad chapter gets low content score
- **WHEN** eval_content runs on a directory containing only the low-quality fixture
- **THEN** the score SHALL be < 20 with volume=0 and depth=0

### Requirement: Good visual report scores above 25/35
The test suite SHALL include a report.json fixture with all features working (mermaid rendered, no errors, sidebar present) and verify visual score >= 25.

#### Scenario: Fully functional webapp scores high
- **WHEN** eval_visual runs with a report showing 0 errors, mermaid SVGs rendered, sidebar present
- **THEN** the score SHALL be >= 25

### Requirement: Broken visual report scores below 15/35
The test suite SHALL include a report.json fixture with no build or all components broken and verify visual score < 15.

#### Scenario: Broken webapp scores low
- **WHEN** eval_visual runs with a report showing build failure or 5+ errors and no mermaid
- **THEN** the score SHALL be < 15

### Requirement: Calibration survives formula changes
When eval formulas are modified, calibration tests SHALL detect if known-good samples drop below threshold or known-bad samples rise above threshold.

#### Scenario: Formula change detected
- **WHEN** a formula change causes a good chapter to score < 25
- **THEN** the calibration test SHALL fail with a message identifying the score drift

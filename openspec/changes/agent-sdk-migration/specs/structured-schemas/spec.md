## ADDED Requirements

### Requirement: PlanOutput Pydantic model
The system SHALL define a `PlanOutput` Pydantic model that validates the JSON output of the planning phase with fields: `plan_summary` (str), `chapters_to_write` (list of objects with `id` and `focus`), `needs_webapp_improve` (bool), `webapp_improve_focus` (enum: visual|interaction|both|none), `improvement_focus` (str).

#### Scenario: Valid plan output parsing
- **WHEN** the Claude Agent SDK returns a plan response
- **THEN** the system SHALL validate the response against `PlanOutput` and raise a `ValidationError` if any required field is missing or has an incorrect type

#### Scenario: Fallback for empty chapters list
- **WHEN** `chapters_to_write` is empty or missing
- **THEN** the system SHALL compute a fallback list of unwritten chapters (matching the bash fallback behavior in `step_analyze`)

### Requirement: ChapterJSON Pydantic model
The system SHALL define a `ChapterJSON` Pydantic model matching the existing chapter JSON schema with fields: `id`, `title`, `summary`, `sections` (list), `word_count`, `mermaid_diagrams`, `key_code_snippets`, and all other fields defined in the chapter-json-contract rule.

#### Scenario: Chapter output validation
- **WHEN** a chapter is written by the Claude Agent SDK
- **THEN** the system SHALL validate the response against `ChapterJSON` and persist only valid chapters to `knowledge/{project}/chapters/{id}.json`

#### Scenario: Existing chapter compatibility
- **WHEN** a chapter JSON file written by `run.sh` is loaded
- **THEN** the `ChapterJSON` model SHALL successfully parse it without errors

### Requirement: EvalResult Pydantic model
The system SHALL define an `EvalResult` Pydantic model for evaluation output with fields: `score` (int), `scores` (object with `content`, `visual`, `interaction`), `content` (breakdown object), `visual` (breakdown object), `interaction` (breakdown object).

#### Scenario: Evaluation result structure
- **WHEN** the evaluation phase completes
- **THEN** the result SHALL conform to `EvalResult` with all sub-scores as integers matching the bash output format

### Requirement: HarnessState Pydantic model
The system SHALL define a `HarnessState` Pydantic model matching the `state.json` format with fields: `iteration` (int), `score` (int), `scores` (object), `phase` (str), `start_time` (optional datetime), `modules_analyzed` (list), `errors` (list), `history` (list of score records).

#### Scenario: State file round-trip
- **WHEN** `state.json` is read, deserialized into `HarnessState`, and written back
- **THEN** the output file SHALL be semantically identical to the input (same fields, same values)

#### Scenario: Bash-written state file compatibility
- **WHEN** a `state.json` written by `run.sh` is loaded
- **THEN** the `HarnessState` model SHALL parse it without errors

### Requirement: ProjectConfig Pydantic model
The system SHALL define a `ProjectConfig` Pydantic model for `projects/*.yaml` files with fields: `name`, `repo_path`, `target_dir`, `language`, `description`, `book` (object with `title`), `chapters` (list of chapter definitions).

#### Scenario: Project config validation
- **WHEN** a YAML project file is loaded and parsed
- **THEN** the system SHALL validate it against `ProjectConfig` and expose all fields as typed attributes

### Requirement: Agent SDK structured output integration
The system SHALL pass Pydantic models as response schemas to the Claude Agent SDK to obtain validated JSON responses directly, eliminating the need for post-hoc JSON cleaning (markdown fence stripping, brace extraction).

#### Scenario: No JSON cleaning needed
- **WHEN** the Agent SDK returns a structured response
- **THEN** the response SHALL be a valid instance of the specified Pydantic model without any string manipulation or regex extraction

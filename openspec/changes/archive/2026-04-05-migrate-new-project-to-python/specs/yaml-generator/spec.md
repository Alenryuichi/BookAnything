## ADDED Requirements

### Requirement: Generate valid ProjectConfig-compatible YAML
The generated `projects/*.yaml` SHALL be parseable by `load_project_config()` and SHALL contain all required fields: `name`, `repo_path`, `target_dir`, `language`, `description`, `book` (with `title`, `subtitle`, `stats`), and `chapters` list.

#### Scenario: Generated YAML is round-trippable
- **WHEN** the generator produces a YAML file
- **THEN** `load_project_config(path)` successfully returns a `ProjectConfig` instance with all chapters populated

### Requirement: Include Part comments in YAML
The YAML output SHALL include comment lines (`# ─── Part N: Title ───`) before each group of chapters belonging to the same Part. These comments are informational and do not affect parsing.

#### Scenario: Multi-part book
- **WHEN** Claude returns 3 parts with 4, 5, and 3 chapters respectively
- **THEN** the YAML contains 3 Part comment blocks, each followed by its chapters

### Requirement: Chapter fields match config schema
Each chapter in the YAML SHALL include: `id`, `title`, `subtitle`, `sources`, `prerequisites`, and `outline` — matching the `ChapterConfig` Pydantic model fields.

#### Scenario: Chapter with prerequisites
- **WHEN** Claude specifies chapter `ch05-routing` with prerequisites `["ch02-architecture", "ch03-components"]`
- **THEN** the YAML entry has `prerequisites: ["ch02-architecture", "ch03-components"]`

### Requirement: Use Claude-inferred project name when available
The system SHALL prefer the `project_name` from Claude's JSON response over the filesystem-inferred name for the `name` field and `book.title`.

#### Scenario: Claude provides display name
- **WHEN** filesystem basename is "claude-code" but Claude returns `"project_name": "Claude Code"`
- **THEN** YAML `name` is "Claude Code" and `book.title` is "深入理解 Claude Code"

### Requirement: Fallback YAML is also valid
The fallback skeleton YAML (when Claude fails) SHALL also be parseable by `load_project_config()` and SHALL include the same field structure.

#### Scenario: Fallback YAML loads correctly
- **WHEN** fallback skeleton generates `projects/my-project.yaml`
- **THEN** `load_project_config("projects/my-project.yaml")` succeeds

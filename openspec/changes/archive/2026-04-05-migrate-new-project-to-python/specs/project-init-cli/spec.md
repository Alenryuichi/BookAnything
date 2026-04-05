## ADDED Requirements

### Requirement: Init subcommand available via CLI
The system SHALL expose a `python3 -m pyharness init <repo_path>` subcommand that initializes a new project config from a target repository.

#### Scenario: Basic invocation
- **WHEN** user runs `python3 -m pyharness init /path/to/repo`
- **THEN** the system scans the repo, calls Claude for chapter planning, generates `projects/<name>.yaml`, and prints the output path

#### Scenario: Missing repo path argument
- **WHEN** user runs `python3 -m pyharness init` without providing a repo path
- **THEN** the system prints usage help and exits with code 1

#### Scenario: Non-existent repo path
- **WHEN** user runs `python3 -m pyharness init /nonexistent/path`
- **THEN** the system prints an error message "仓库路径不存在" and exits with code 1

### Requirement: .env auto-loaded before init
The system SHALL load environment variables from `.env` (via `python-dotenv`) before executing init logic, ensuring `CLAUDE_CMD` and other overrides are available.

#### Scenario: CLAUDE_CMD from .env used during init
- **WHEN** `.env` contains `CLAUDE_CMD=my-custom-claude` and user runs `python3 -m pyharness init /path/to/repo`
- **THEN** the Claude CLI call uses `my-custom-claude` as the command

### Requirement: Output path follows naming convention
The system SHALL generate the output file at `projects/<safe-name>.yaml`, where `<safe-name>` is the project name lowercased, spaces replaced with hyphens, non-alphanumeric characters stripped.

#### Scenario: Project name with special characters
- **WHEN** the inferred project name is "My Awesome Project!"
- **THEN** the output file is `projects/my-awesome-project.yaml`

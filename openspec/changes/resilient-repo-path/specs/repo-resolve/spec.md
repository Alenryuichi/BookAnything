## ADDED Requirements

### Requirement: Relative repo_path resolution

The system SHALL resolve `repo_path` values in project YAML files relative to the harness root directory when the path does not start with `/`. Absolute paths (starting with `/`) SHALL be used as-is for backward compatibility.

#### Scenario: Relative path resolves correctly
- **WHEN** a project YAML contains `repo_path: "workspaces/autoresearch"` and the harness root is `/home/user/harness`
- **THEN** the resolved path SHALL be `/home/user/harness/workspaces/autoresearch`

#### Scenario: Absolute path used as-is
- **WHEN** a project YAML contains `repo_path: "/tmp/my-repo"`
- **THEN** the resolved path SHALL be `/tmp/my-repo` regardless of the harness root

### Requirement: Auto re-clone when repo missing

The system SHALL automatically clone the repository from `remote_url` when the resolved `repo_path` directory does not exist and `remote_url` is present in the project YAML.

#### Scenario: Missing directory with remote_url triggers clone
- **WHEN** the resolved `repo_path` does not exist and `remote_url` is `"https://github.com/user/repo"`
- **THEN** the system SHALL execute `git clone <remote_url> <resolved_path>` and return the resolved path on success

#### Scenario: Clone failure raises clear error
- **WHEN** the auto re-clone fails (network error, auth required, invalid URL)
- **THEN** the system SHALL raise an exception containing both the original error and the `remote_url` that was attempted

#### Scenario: Missing directory without remote_url raises error
- **WHEN** the resolved `repo_path` does not exist and no `remote_url` is configured
- **THEN** the system SHALL raise `RepoNotFoundError` with the message including the resolved path

### Requirement: remote_url field in project YAML

The `pyharness init` command SHALL accept an optional `--remote-url` argument. When provided, the generated project YAML SHALL include a `remote_url` field.

#### Scenario: Init with remote URL
- **WHEN** `pyharness init /path/to/repo --remote-url https://github.com/user/repo`
- **THEN** the generated YAML SHALL contain `remote_url: "https://github.com/user/repo"`

#### Scenario: Init without remote URL
- **WHEN** `pyharness init /path/to/repo` (no --remote-url)
- **THEN** the generated YAML SHALL NOT contain a `remote_url` field

### Requirement: Relative path in new YAML files

The `pyharness init` command SHALL write `repo_path` as a relative path (relative to harness root) when the repository is located under the harness root directory tree. Otherwise, it SHALL write the absolute path.

#### Scenario: Repo inside harness root
- **WHEN** harness root is `/home/user/harness` and repo is at `/home/user/harness/workspaces/myrepo`
- **THEN** the YAML SHALL contain `repo_path: "workspaces/myrepo"`

#### Scenario: Repo outside harness root
- **WHEN** harness root is `/home/user/harness` and repo is at `/tmp/external-repo`
- **THEN** the YAML SHALL contain `repo_path: "/tmp/external-repo"`

### Requirement: All pyharness commands use resolve_repo_path

The `run`, `analyze`, and `init` commands SHALL resolve the repository path through the unified `resolve_repo_path` function before accessing the filesystem.

#### Scenario: Runner resolves path at startup
- **WHEN** `HarnessRunner` is initialized with a project config
- **THEN** it SHALL call `resolve_repo_path` and use the returned path for all subsequent operations

#### Scenario: Analyze resolves path before scanning
- **WHEN** `step_analyze` begins execution
- **THEN** it SHALL call `resolve_repo_path` and use the returned path for file tree scanning

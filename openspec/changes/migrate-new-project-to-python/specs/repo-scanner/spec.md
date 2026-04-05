## ADDED Requirements

### Requirement: Auto-infer project name from manifest files
The system SHALL attempt to infer the project name from standard manifest files in this priority order:
1. `package.json` → `.name` field (strip `@scope/` prefix)
2. `Cargo.toml` → `name` field
3. `go.mod` → module name (last path segment)
4. Fallback: directory basename

#### Scenario: Node.js project with scoped package name
- **WHEN** repo contains `package.json` with `"name": "@anthropic/claude-code"`
- **THEN** the inferred project name is `claude-code`

#### Scenario: No manifest files exist
- **WHEN** repo at `/path/to/my-project` contains no `package.json`, `Cargo.toml`, or `go.mod`
- **THEN** the inferred project name is `my-project` (directory basename)

### Requirement: Auto-detect source directory
The system SHALL check for standard source directories in order: `src`, `lib`, `packages`, `app`, `cmd`, `internal`. If none exist, default to `.` (repo root).

#### Scenario: Repo with src directory
- **WHEN** repo contains a `src/` directory
- **THEN** the detected source directory is `src`

#### Scenario: Repo with no standard source dirs
- **WHEN** repo contains only custom directories (e.g., `core/`, `engine/`)
- **THEN** the detected source directory is `.`

### Requirement: Auto-detect primary language by file extension count
The system SHALL count source files by extension within the detected source directory and select the language with the highest file count. Supported extensions:
- `.ts`/`.tsx` → TypeScript
- `.py` → Python
- `.go` → Go
- `.rs` → Rust
- `.c`/`.cpp`/`.h` → C/C++
- `.java`/`.kt` → Java

#### Scenario: Mixed repo with majority TypeScript
- **WHEN** source directory contains 200 `.ts` files and 50 `.py` files
- **THEN** the detected language is `TypeScript`

### Requirement: Collect file and line count statistics
The system SHALL count total source files (excluding `node_modules`, `.git`, `dist`, `__pycache__`) and sum line counts for recognized source extensions.

#### Scenario: Standard repo scan
- **WHEN** repo source directory contains 150 source files with 25000 total lines
- **THEN** stats report `files: 150` and `lines: 25000`

### Requirement: Collect directory tree (2-level depth)
The system SHALL collect all directories up to 2 levels deep from the source directory, excluding `node_modules`, `.git`, `dist`, `__pycache__`, limited to 80 entries.

#### Scenario: Large repo with many directories
- **WHEN** source directory contains 120 subdirectories at depth ≤ 2
- **THEN** only the first 80 (sorted alphabetically) are included in the tree

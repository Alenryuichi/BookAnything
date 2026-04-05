#!/bin/bash
# PreToolUse hook: path boundary enforcement and dangerous git command blocking
# Reads tool input from stdin JSON, returns deny decision if violation detected.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# --- Path boundary check for Write/Edit ---
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

  if [[ -z "$FILE_PATH" ]]; then
    exit 0
  fi

  # Resolve to absolute path for consistent checking
  HARNESS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

  # Normalize: if relative, prepend harness dir
  if [[ "$FILE_PATH" != /* ]]; then
    ABS_PATH="$HARNESS_DIR/$FILE_PATH"
  else
    ABS_PATH="$FILE_PATH"
  fi

  # Whitelist: harness subdirectories + root-level config files
  ALLOWED=false
  for dir in knowledge web-app output openspec .claude scripts prompts pyharness tests; do
    if [[ "$ABS_PATH" == "$HARNESS_DIR/$dir"* ]]; then
      ALLOWED=true
      break
    fi
  done
  # Also allow specific root-level files
  for file in run.sh CLAUDE.md goals.yaml state.json .gitignore requirements.txt pyproject.toml; do
    if [[ "$ABS_PATH" == "$HARNESS_DIR/$file" ]]; then
      ALLOWED=true
      break
    fi
  done

  if [[ "$ALLOWED" == "false" ]]; then
    echo '{"decision":"deny","reason":"Path boundary violation: writes only allowed to knowledge/, web-app/, output/, openspec/, .claude/ under harness root. Attempted: '"$FILE_PATH"'"}'
    exit 2
  fi
fi

# --- Dangerous git command check for Bash ---
if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

  if echo "$COMMAND" | grep -qE 'git\s+(push|reset|rebase)'; then
    echo '{"decision":"deny","reason":"Git safety violation: git push/reset/rebase are prohibited. Only git status/log/diff allowed."}'
    exit 2
  fi

  if echo "$COMMAND" | grep -qE 'git\s+checkout\s+.*(-f|--force)'; then
    echo '{"decision":"deny","reason":"Git safety violation: git checkout -f/--force is prohibited."}'
    exit 2
  fi

  if echo "$COMMAND" | grep -qE 'git\s+clean\s+.*-f'; then
    echo '{"decision":"deny","reason":"Git safety violation: git clean -f is prohibited."}'
    exit 2
  fi

  if echo "$COMMAND" | grep -qE 'git\s+branch\s+.*-D'; then
    echo '{"decision":"deny","reason":"Git safety violation: git branch -D is prohibited."}'
    exit 2
  fi
fi

exit 0

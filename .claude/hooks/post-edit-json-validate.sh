#!/bin/bash
# PostToolUse hook: validate JSON files written under knowledge/**/chapters/
# Returns block decision if JSON is invalid or missing required fields.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only validate chapter JSON files
if ! echo "$FILE_PATH" | grep -qE 'knowledge/.*/chapters/.*\.json$'; then
  exit 0
fi

# Check file exists
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Validate JSON syntax
if ! jq empty "$FILE_PATH" 2>/dev/null; then
  echo '{"decision":"block","reason":"Invalid JSON syntax in '"$FILE_PATH"'. File must be valid JSON."}'
  exit 2
fi

# Check required fields
MISSING=""
for field in chapter_id title sections; do
  VAL=$(jq -r ".$field // empty" "$FILE_PATH" 2>/dev/null)
  if [[ -z "$VAL" ]]; then
    MISSING="$MISSING $field"
  fi
done

# Check sections is array
SECTIONS_TYPE=$(jq -r '.sections | type' "$FILE_PATH" 2>/dev/null || echo "null")
if [[ "$SECTIONS_TYPE" != "array" ]]; then
  MISSING="$MISSING sections(must be array)"
fi

if [[ -n "$MISSING" ]]; then
  echo '{"decision":"block","reason":"Chapter JSON missing required fields:'"$MISSING"'. See .claude/rules/chapter-json-contract.md"}'
  exit 2
fi

exit 0

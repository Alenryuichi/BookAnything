#!/bin/bash
# SubagentStart/SubagentStop hook: log subagent lifecycle events.
# Appends structured log lines to output/logs/subagent-activity.log

set -euo pipefail

INPUT=$(cat)
LOG_DIR="output/logs"
LOG_FILE="$LOG_DIR/subagent-activity.log"

mkdir -p "$LOG_DIR"

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
EVENT=$(echo "$INPUT" | jq -r '.event_type // "unknown"')
TIMESTAMP=$(date -Iseconds)

echo "[$TIMESTAMP] $EVENT agent_id=$AGENT_ID agent_type=$AGENT_TYPE" >> "$LOG_FILE"

exit 0

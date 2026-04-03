#!/bin/bash
# SessionStart hook (compact matcher): re-inject key constraints after context compaction.
# Outputs additionalContext JSON to stdout.

set -euo pipefail

PROJECT_NAME=""
if [ -f "state.json" ]; then
  ITERATION=$(jq -r '.iteration // 0' state.json 2>/dev/null || echo "0")
  SCORE=$(jq -r '.score // 0' state.json 2>/dev/null || echo "0")
else
  ITERATION="?"
  SCORE="?"
fi

cat <<'CONTEXT'
{
  "additionalContext": "POST-COMPACTION CONTEXT REMINDER:\n\n1. OUTPUT FORMAT: All chapter outputs MUST be pure JSON. No markdown fences. No prose before/after JSON.\n2. PATH BOUNDARIES: Only write to knowledge/, web-app/, output/, openspec/, .claude/. Never write to the target source repo.\n3. GIT SAFETY: Only git status/log/diff allowed. No push/reset/rebase/checkout -f/branch -D.\n4. CHAPTER CONTRACT: Required fields: chapter_id, title, sections (array), key_takeaways, word_count (3000-5000).\n5. WRITING STYLE: 70% text / 30% code. Storytelling approach. Opening hooks. Analogies. Mermaid diagrams.\n\nSee .claude/rules/ for full constraint definitions."
}
CONTEXT

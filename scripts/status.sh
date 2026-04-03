#!/bin/bash
# 查看 Harness 运行状态
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$HARNESS_DIR/state.json"
WEBAPP_DIR="$HARNESS_DIR/web-app"
LOG_DIR="$HARNESS_DIR/output/logs"

# ── 命令行参数 ──
PROJECT_FILE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── 加载项目配置 ──
PROJECT_FILE="${PROJECT_FILE:-$HARNESS_DIR/projects/claude-code.yaml}"
if [ -f "$PROJECT_FILE" ]; then
  PROJECT_NAME=$(grep "^name:" "$PROJECT_FILE" | head -1 | sed 's/.*name: *//' | tr -d '"')
else
  PROJECT_NAME="深入理解 Claude Code"
fi

KNOWLEDGE_DIR="$HARNESS_DIR/knowledge/$PROJECT_NAME"
MODULES_DIR="$KNOWLEDGE_DIR/modules"
CHAPTERS_DIR="$KNOWLEDGE_DIR/chapters"

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[1m'; N='\033[0m'

if [ ! -f "$STATE_FILE" ]; then
  echo "Harness has not been started yet."
  exit 1
fi

echo -e "${B}${C}═══ Harness Status (v2) ═══${N}"
echo -e "  Project: $PROJECT_NAME"
echo ""
echo -e "${B}Progress:${N}"
echo "  Iteration : $(jq '.iteration' "$STATE_FILE")"
echo "  Total Score: $(jq '.score' "$STATE_FILE") / 100"
echo "  Phase     : $(jq -r '.phase' "$STATE_FILE")"
echo "  Started   : $(jq -r '.start_time // "not started"' "$STATE_FILE")"
echo ""

# Multi-dimensional scores
echo -e "${B}Dimensional Scores:${N}"
echo "  Content    : $(jq '.scores.content // "N/A"' "$STATE_FILE") / 40"
echo "  Visual     : $(jq '.scores.visual // "N/A"' "$STATE_FILE") / 35"
echo "  Interaction: $(jq '.scores.interaction // "N/A"' "$STATE_FILE") / 25"
echo ""

# Show chapters
CHAPTER_COUNT=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo -e "${B}Chapters:${N} $CHAPTER_COUNT written"
if [ "$CHAPTER_COUNT" -gt 0 ]; then
  for f in "$CHAPTERS_DIR"/*.json; do
    local_size=$(wc -c < "$f" | tr -d ' ')
    echo -e "  ${G}●${N} $(basename "$f" .json) (${local_size}B)"
  done
fi
echo ""

# Show legacy modules if any
ANALYZED=$(ls "$MODULES_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANALYZED" -gt 0 ]; then
  echo -e "${B}Legacy Modules:${N} $ANALYZED"
  for f in "$MODULES_DIR"/*.json; do
    local_size=$(wc -c < "$f" | tr -d ' ')
    echo -e "  ${G}●${N} $(basename "$f" .json) (${local_size}B)"
  done
  echo ""
fi

echo -e "${B}Web App:${N}"
if [ -d "$WEBAPP_DIR/out" ]; then
  echo -e "  ${G}●${N} Built ($(du -sh "$WEBAPP_DIR/out" 2>/dev/null | cut -f1))"
else
  echo -e "  ${Y}○${N} Not yet built"
fi
echo ""

echo -e "${B}Score History:${N}"
jq -r '.history[]? | "  #\(.iteration): \(.total // .score) pts (C:\(.content // "?") V:\(.visual // "?") I:\(.interaction // "?"))"' "$STATE_FILE" 2>/dev/null || echo "  No history"
echo ""

echo -e "${B}Recent Logs:${N}"
tail -8 "$LOG_DIR/harness.log" 2>/dev/null | sed 's/^/  /' || echo "  No logs"

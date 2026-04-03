#!/bin/bash
# 重置 Harness 状态
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"

KEEP_ANALYSIS=false
PROJECT_FILE=""

# ── 命令行参数 ──
while [[ $# -gt 0 ]]; do
  case $1 in
    --keep-analysis) KEEP_ANALYSIS=true; shift ;;
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

echo "Resetting harness for project: $PROJECT_NAME ..."

cat > "$HARNESS_DIR/state.json" <<'EOF'
{"iteration":0,"score":0,"phase":"init","start_time":null,"modules_analyzed":[],"errors":[],"history":[]}
EOF
echo "  ✓ state.json"

rm -rf "$HARNESS_DIR/output/logs"
mkdir -p "$HARNESS_DIR/output/logs"
echo "  ✓ logs"

rm -rf "$HARNESS_DIR/web-app/.next" "$HARNESS_DIR/web-app/out"
echo "  ✓ web-app build cache"

if [ "$KEEP_ANALYSIS" = false ]; then
  rm -f "$KNOWLEDGE_DIR/modules"/*.json 2>/dev/null || true
  rm -f "$KNOWLEDGE_DIR/chapters"/*.json 2>/dev/null || true
  echo "  ✓ analysis data cleared ($KNOWLEDGE_DIR)"
else
  echo "  ⏩ analysis data kept"
fi

rm -f "$HARNESS_DIR/.harness.lock"
echo ""
echo "Done! Run 'bash harness/run.sh --project $PROJECT_FILE' to start."

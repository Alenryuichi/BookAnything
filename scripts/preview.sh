#!/bin/bash
# 预览网页应用
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEBAPP_DIR="$HARNESS_DIR/web-app"
PORT="${PORT:-3000}"

# ── 命令行参数 ──
PROJECT_FILE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT_FILE="$2"; shift 2 ;;
    --port)    PORT="$2"; shift 2 ;;
    [0-9]*)    PORT="$1"; shift ;;  # backward compat: positional port
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

export KNOWLEDGE_PROJECT="$PROJECT_NAME"

if [ ! -d "$WEBAPP_DIR/out" ]; then
  echo "No build output. Building for project: $PROJECT_NAME ..."
  cd "$WEBAPP_DIR" && KNOWLEDGE_PROJECT="$PROJECT_NAME" npx next build
fi

echo "Project: $PROJECT_NAME"
echo "Serving: $WEBAPP_DIR/out/"
echo "Open: http://localhost:$PORT"
cd "$WEBAPP_DIR" && npx serve out -l "$PORT"

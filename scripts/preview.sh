#!/bin/bash
# Preview the book website
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_DIR="$(dirname "$SCRIPT_DIR")"
WEBAPP_DIR="$HARNESS_DIR/web-app"

# Rebuild index first
bash "$SCRIPT_DIR/rebuild-index.sh"

cd "$WEBAPP_DIR"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
fi

# Build if needed
if [ ! -d ".next" ]; then
  echo "Building..."
  npm run build
fi

echo ""
echo "Starting server at http://localhost:3000"
echo "  Book shelf: http://localhost:3000/books"
echo ""
npm run start

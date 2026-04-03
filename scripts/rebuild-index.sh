#!/bin/bash
# Rebuild knowledge/index.json from knowledge/ directories and projects/*.yaml
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_DIR="$(dirname "$SCRIPT_DIR")"
KNOWLEDGE_DIR="$HARNESS_DIR/knowledge"
PROJECTS_DIR="$HARNESS_DIR/projects"
INDEX_FILE="$KNOWLEDGE_DIR/index.json"

derive_slug() {
  local name="$1"
  # Extract English words, lowercase, join with hyphens
  local slug
  slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | tr -s ' ' '-' | sed 's/^-//;s/-$//')
  if [ -z "$slug" ]; then
    slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
  fi
  echo "$slug"
}

echo '{"books":[' > "$INDEX_FILE.tmp"
first=true

for book_dir in "$KNOWLEDGE_DIR"/*/; do
  [ ! -d "$book_dir/chapters" ] && continue
  dir_name=$(basename "$book_dir")
  [ "$dir_name" = "modules" ] && continue

  written=$(find "$book_dir/chapters" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  [ "$written" -eq 0 ] && continue

  # Find matching project yaml
  proj_name="" proj_desc="" proj_lang="" proj_files=0 proj_lines=0 chapter_count=0
  for yaml_file in "$PROJECTS_DIR"/*.yaml; do
    [ ! -f "$yaml_file" ] && continue
    yaml_name=$(grep "^name:" "$yaml_file" | head -1 | sed 's/.*name: *//' | tr -d '"')
    if [ "$yaml_name" = "$dir_name" ]; then
      proj_name="$yaml_name"
      proj_desc=$(grep "^description:" "$yaml_file" | head -1 | sed 's/.*description: *//' | tr -d '"')
      proj_lang=$(grep "^language:" "$yaml_file" | head -1 | sed 's/.*language: *//' | tr -d '"')
      proj_files=$(grep "files:" "$yaml_file" | head -1 | grep -oE '[0-9]+' || echo "0")
      proj_lines=$(grep "lines:" "$yaml_file" | head -1 | grep -oE '[0-9]+' || echo "0")
      chapter_count=$(grep -c "^  - id:" "$yaml_file" 2>/dev/null || echo "0")
      break
    fi
  done

  [ -z "$proj_name" ] && proj_name="$dir_name"
  [ "$chapter_count" -eq 0 ] && chapter_count="$written"

  slug=$(derive_slug "$proj_name")

  # Get last updated from newest file
  newest=$(find "$book_dir/chapters" -name "*.json" -type f -exec stat -f '%m' {} \; 2>/dev/null | sort -rn | head -1 || echo "0")
  if [ "$newest" != "0" ] && [ -n "$newest" ]; then
    last_updated=$(date -r "$newest" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "")
  else
    last_updated=""
  fi

  # Get score from state.json
  score=0
  if [ -f "$HARNESS_DIR/state.json" ]; then
    score=$(jq -r '.score // 0' "$HARNESS_DIR/state.json" 2>/dev/null || echo "0")
  fi

  [ "$first" = true ] && first=false || echo ',' >> "$INDEX_FILE.tmp"
  cat >> "$INDEX_FILE.tmp" <<ENTRY
{"id":"$slug","name":"$proj_name","dirName":"$dir_name","description":"$proj_desc","language":"$proj_lang","chapterCount":$chapter_count,"writtenCount":$written,"lastUpdated":"$last_updated","score":$score,"stats":{"files":$proj_files,"lines":$proj_lines}}
ENTRY

done

echo ']}' >> "$INDEX_FILE.tmp"

# Pretty-print with jq if available
if command -v jq &>/dev/null; then
  jq '.' "$INDEX_FILE.tmp" > "$INDEX_FILE"
  rm "$INDEX_FILE.tmp"
else
  mv "$INDEX_FILE.tmp" "$INDEX_FILE"
fi

echo "Generated $INDEX_FILE"
jq '.books | length' "$INDEX_FILE" 2>/dev/null && echo " book(s) indexed" || true

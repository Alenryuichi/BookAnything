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

mkdir -p "$KNOWLEDGE_DIR"
echo '{"books":[' > "$INDEX_FILE.tmp"
first=true

for yaml_file in "$PROJECTS_DIR"/*.yaml; do
  [ ! -f "$yaml_file" ] && continue
  [ "$(basename "$yaml_file")" = "example.yaml" ] && continue
  
  yaml_name=$(grep "^name:" "$yaml_file" | head -1 | sed 's/.*name: *//' | tr -d '"' | tr -d "'")
  
  proj_name="$yaml_name"
  proj_desc=$(grep "^description:" "$yaml_file" | head -1 | sed 's/.*description: *//' | tr -d '"' | tr -d "'")
  proj_lang=$(grep "^language:" "$yaml_file" | head -1 | sed 's/.*language: *//' | tr -d '"' | tr -d "'")
  proj_files=$(grep "files:" "$yaml_file" | head -1 | grep -oE '[0-9]+' || echo "0")
  proj_lines=$(grep "lines:" "$yaml_file" | head -1 | grep -oE '[0-9]+' || echo "0")
  chapter_count=$(grep -c "^  - id:" "$yaml_file" 2>/dev/null || echo "0")
  
  dir_name="$proj_name"
  book_dir="$KNOWLEDGE_DIR/$dir_name"
  
  written=0
  if [ -d "$book_dir/chapters" ]; then
    written=$(find "$book_dir/chapters" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  fi

  slug=$(derive_slug "$proj_name")
  if [ -z "$slug" ]; then
    slug=$(basename "$yaml_file" .yaml)
  fi

  newest=0
  if [ -d "$book_dir/chapters" ]; then
    newest=$(find "$book_dir/chapters" -name "*.json" -type f -exec stat -f '%m' {} \; 2>/dev/null | sort -rn | head -1 || echo "0")
  fi
  
  if [ "$newest" != "0" ] && [ -n "$newest" ]; then
    last_updated=$(date -r "$newest" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "")
  else
    last_updated=""
  fi

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

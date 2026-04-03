#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 新建项目配置
# 用法: bash new-project.sh /path/to/repo
#
# 只需一个参数（仓库路径），其余全部自动推断：
#   - 项目名 → 从目录名或 package.json/Cargo.toml 等提取
#   - 语言   → 按文件后缀统计自动判断
#   - 源码目录 → 自动检测 src/, lib/, packages/ 等
#
# Phase 1: 扫描仓库，自动推断项目元信息
# Phase 2: 调用 Claude 分析源码，智能规划章节
# Phase 3: 生成完整的 project.yaml（含 Part 分组、章节大纲）
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="$SCRIPT_DIR/projects"
LOG_DIR="$SCRIPT_DIR/output/logs"
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_TIMEOUT="${CLAUDE_TIMEOUT:-300}"

# macOS 兼容: 优先用 gtimeout
if command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
elif command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
else
  TIMEOUT_CMD=""
fi

# ── 参数检查 ──
if [ $# -lt 1 ]; then
  echo "用法: bash $0 <仓库路径>"
  echo ""
  echo "示例:"
  echo "  bash $0 /path/to/react"
  echo "  bash $0 /path/to/linux"
  echo "  bash $0 .                   # 当前目录"
  echo ""
  echo "项目名、语言、源码目录全部自动推断。"
  exit 1
fi

REPO_PATH="$(cd "$1" 2>/dev/null && pwd || echo "$1")"

if [ ! -d "$REPO_PATH" ]; then
  echo "ERROR: 仓库路径不存在: $REPO_PATH"
  exit 1
fi

# ═══════════════════════════════════════
#  Phase 1: 扫描仓库，自动推断元信息
# ═══════════════════════════════════════
echo ""
echo "═══ Phase 1: 扫描仓库 ═══"
echo "路径: $REPO_PATH"

# ── 自动推断项目名 ──
PROJECT_NAME=""
# 优先从 package.json / Cargo.toml / go.mod / setup.py 等提取
if [ -f "$REPO_PATH/package.json" ]; then
  PROJECT_NAME=$(jq -r '.name // empty' "$REPO_PATH/package.json" 2>/dev/null || true)
  # 去掉 scope 前缀 @org/name → name
  PROJECT_NAME="${PROJECT_NAME##*/}"
fi
if [ -z "$PROJECT_NAME" ] && [ -f "$REPO_PATH/Cargo.toml" ]; then
  PROJECT_NAME=$(grep '^name' "$REPO_PATH/Cargo.toml" | head -1 | sed 's/.*= *"//' | tr -d '"' || true)
fi
if [ -z "$PROJECT_NAME" ] && [ -f "$REPO_PATH/go.mod" ]; then
  PROJECT_NAME=$(head -1 "$REPO_PATH/go.mod" | sed 's|module .*/||' || true)
fi
# 回退到目录名
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME=$(basename "$REPO_PATH")
fi
echo "  项目名: $PROJECT_NAME"

# ── 自动推断源码目录 ──
TARGET_DIR=""
for candidate in src lib packages app cmd internal; do
  if [ -d "$REPO_PATH/$candidate" ]; then
    TARGET_DIR="$candidate"
    break
  fi
done
if [ -z "$TARGET_DIR" ]; then
  TARGET_DIR="."
fi
echo "  源码目录: $TARGET_DIR"

# ── 自动推断语言 ──
detect_language() {
  local repo="$1"
  local dir="$2"
  local search_path="$repo/$dir"
  [ "$dir" = "." ] && search_path="$repo"

  # 统计各语言文件数
  local ts_count py_count go_count rs_count c_count java_count
  ts_count=$(find "$search_path" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  py_count=$(find "$search_path" -type f -name "*.py" ! -path "*/__pycache__/*" 2>/dev/null | wc -l | tr -d ' ')
  go_count=$(find "$search_path" -type f -name "*.go" 2>/dev/null | wc -l | tr -d ' ')
  rs_count=$(find "$search_path" -type f -name "*.rs" 2>/dev/null | wc -l | tr -d ' ')
  c_count=$(find "$search_path" -type f \( -name "*.c" -o -name "*.cpp" -o -name "*.h" \) 2>/dev/null | wc -l | tr -d ' ')
  java_count=$(find "$search_path" -type f \( -name "*.java" -o -name "*.kt" \) 2>/dev/null | wc -l | tr -d ' ')

  # 选最多的
  local max=0 lang="TypeScript"
  for pair in "$ts_count:TypeScript" "$py_count:Python" "$go_count:Go" "$rs_count:Rust" "$c_count:C/C++" "$java_count:Java"; do
    local count="${pair%%:*}"
    local name="${pair#*:}"
    if [ "$count" -gt "$max" ]; then
      max="$count"
      lang="$name"
    fi
  done
  echo "$lang"
}

LANGUAGE=$(detect_language "$REPO_PATH" "$TARGET_DIR")
echo "  语言: $LANGUAGE"

# ── 统计文件数和行数 ──
SCAN_PATH="$REPO_PATH/$TARGET_DIR"
[ "$TARGET_DIR" = "." ] && SCAN_PATH="$REPO_PATH"

FILE_COUNT=$(find "$SCAN_PATH" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" 2>/dev/null | wc -l | tr -d ' ')
LINE_COUNT=$(find "$SCAN_PATH" -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
  -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.c" -o -name "*.cpp" -o -name "*.h" \
  -o -name "*.java" -o -name "*.kt" -o -name "*.swift" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" \
  2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | tr -d ' ' | grep -oE '^[0-9]+' || echo "0")

echo "  文件: $FILE_COUNT"
echo "  代码: ~$LINE_COUNT 行"

# 收集目录树（2层深度）
DIR_TREE=$(find "$SCAN_PATH" -mindepth 1 -maxdepth 2 -type d \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/__pycache__/*" \
  2>/dev/null | sort | head -80)

# 收集各顶层目录的文件数
DIR_STATS=""
while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  REL_PATH="${dir#$REPO_PATH/}"
  D_FILES=$(find "$dir" -type f ! -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
  DIR_STATS="$DIR_STATS\n  $REL_PATH/ ($D_FILES files)"
done <<< "$(find "$SCAN_PATH" -mindepth 1 -maxdepth 1 -type d \
  ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null | sort)"

echo "  顶层目录:"
echo -e "$DIR_STATS"

# ═══════════════════════════════════════
#  Phase 2: 调用 Claude 智能规划章节
# ═══════════════════════════════════════
echo ""
echo "═══ Phase 2: Claude 分析源码，规划章节 ═══"

mkdir -p "$LOG_DIR" "$PROJECTS_DIR"

PROMPT_FILE="$LOG_DIR/_prompt_new_project.md"
RESULT_FILE="$LOG_DIR/new_project_chapters.json"

cat > "$PROMPT_FILE" <<PROMPT
你是一位技术书籍的资深策划编辑。请为开源项目规划一本深入浅出的技术书。

## 项目信息
- 项目名: $PROJECT_NAME
- 语言: $LANGUAGE
- 仓库路径: $REPO_PATH
- 源码目录: $REPO_PATH/$TARGET_DIR
- 文件数: $FILE_COUNT
- 代码行数: ~$LINE_COUNT

## 目录结构
$(echo -e "$DIR_STATS")

## 目录树（2 层）
$(echo "$DIR_TREE" | sed "s|$REPO_PATH/||g")

## 你的任务

1. **先用 Glob/Read/Grep 工具快速探索源码**（重点看入口文件、核心模块、README）
2. 理解项目的架构分层、核心概念、数据流
3. 规划书的章节结构

## 章节规划原则

参考优秀技术书的结构（如《Transformer 架构》分 9 个 Part、32 章）：

1. **按认知递进组织**，不要按目录映射：
   - Part 1: 建立直觉（是什么、为什么、全景图）
   - Part 2-N: 核心概念逐层深入
   - 最后 Part: 总结、进阶、展望

2. **Part 分组**：将相关章节分组为 Part，每个 Part 3-5 章

3. **章节粒度**：
   - 小项目（<1万行）：8-12 章
   - 中项目（1-10万行）：12-20 章
   - 大项目（>10万行）：20-30 章
   - 每章聚焦一个核心概念，不要一章塞太多

4. **每章必须有**：
   - 明确的 sources（对应的源码路径，可以多个逗号分隔）
   - prerequisites（前置章节 id）
   - 5-7 条大纲要点（含开篇场景、核心概念、代码解析、比喻）

5. **id 命名**：ch01-xxx, ch02-yyy...（纯英文 kebab-case）

## 输出要求

直接输出一个 JSON 对象（不要代码块包裹）：

{
  "project_name": "推断的项目展示名（如 Claude Code, React, Linux Kernel）",
  "description": "项目一句话简介",
  "parts": [
    {
      "part_num": 1,
      "part_title": "Part 1 - 建立直觉",
      "chapters": [
        {
          "id": "ch01-what-is-xxx",
          "title": "第1章：XXX 是什么",
          "subtitle": "副标题",
          "sources": "src/main.ts,src/entry",
          "prerequisites": [],
          "outline": "- 开篇：具体场景引入\n- 核心概念1\n- 核心概念2\n- 代码解读\n- 比喻总结"
        }
      ]
    }
  ]
}
PROMPT

echo "  调用 Claude 分析中（可能需要 2-5 分钟）..."

# 执行 Claude
CLAUDE_ERR="$LOG_DIR/new_project.err"
CLAUDE_RAW="$LOG_DIR/new_project.raw.json"

if [ -n "$TIMEOUT_CMD" ]; then
  $TIMEOUT_CMD "$CLAUDE_TIMEOUT" $CLAUDE_CMD -p "$(cat "$PROMPT_FILE")" \
    --output-format json \
    --max-turns 30 \
    --allowedTools "Read,Glob,Grep" \
    2>"$CLAUDE_ERR" >"$CLAUDE_RAW" || true
else
  $CLAUDE_CMD -p "$(cat "$PROMPT_FILE")" \
    --output-format json \
    --max-turns 30 \
    --allowedTools "Read,Glob,Grep" \
    2>"$CLAUDE_ERR" >"$CLAUDE_RAW" || true
fi

# 提取 result
if jq -e '.result' "$CLAUDE_RAW" > /dev/null 2>&1; then
  jq -r '.result' "$CLAUDE_RAW" > "$RESULT_FILE"
else
  cp "$CLAUDE_RAW" "$RESULT_FILE"
fi

# 用 Python 健壮地提取 JSON（处理 </think> 前缀、broken quotes 等）
if ! jq empty "$RESULT_FILE" 2>/dev/null; then
  python3 -c "
import json, re, sys
raw = open(sys.argv[1]).read()
# Strip </think> prefix if present
idx = raw.find('</think>')
if idx >= 0:
    raw = raw[idx+8:]
start = raw.find('{')
end = raw.rfind('}')
if start < 0 or end <= start:
    sys.exit(1)
candidate = raw[start:end+1]
# Try direct parse first
try:
    parsed = json.loads(candidate)
except json.JSONDecodeError:
    # Try fixing missing opening quotes: subtitle\": AI xxx\" -> subtitle\": \"AI xxx\"
    fixed = re.sub(r'\":\s+([A-Za-z\u4e00-\u9fff][^\"]*?\"[,\n}])', r'\": \"\1', candidate)
    try:
        parsed = json.loads(fixed)
    except json.JSONDecodeError:
        sys.exit(1)
with open(sys.argv[1], 'w') as f:
    json.dump(parsed, f, ensure_ascii=False, indent=2)
" "$RESULT_FILE" 2>/dev/null || true
fi

# 验证 Claude 输出
if ! jq -e '.parts' "$RESULT_FILE" > /dev/null 2>&1; then
  echo ""
  echo "ERROR: Claude 未能生成有效的章节规划"
  echo "  原始输出: $CLAUDE_RAW"
  echo "  错误日志: $CLAUDE_ERR"
  echo ""
  echo "回退到基础模式（按目录生成骨架）..."
  echo ""

  # ── 回退：按目录生成 ──
  SAFE_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
  OUTPUT_FILE="$PROJECTS_DIR/$SAFE_NAME.yaml"

  cat > "$OUTPUT_FILE" <<EOF
name: "$PROJECT_NAME"
repo_path: "$REPO_PATH"
target_dir: "$TARGET_DIR"
language: "$LANGUAGE"
description: "TODO: 填写项目简介"

book:
  title: "深入理解 $PROJECT_NAME"
  subtitle: "一本由浅入深的交互式技术书"
  stats:
    files: $FILE_COUNT
    lines: $LINE_COUNT

chapters:
  - id: ch01-introduction
    title: "第1章：${PROJECT_NAME} 是什么"
    subtitle: "项目全景概览"
    sources: "$TARGET_DIR"
    prerequisites: []
    outline: |
      - 项目定位与解决的问题
      - 技术栈概览
      - 架构总览
      - 本书路线图
EOF

  CHAPTER_NUM=2
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    DIR_NAME=$(basename "$dir")
    DIR_FILES=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
    cat >> "$OUTPUT_FILE" <<EOF

  - id: ch$(printf '%02d' $CHAPTER_NUM)-$DIR_NAME
    title: "第${CHAPTER_NUM}章：$DIR_NAME 模块"
    subtitle: "TODO: 填写副标题"
    sources: "$TARGET_DIR/$DIR_NAME"
    prerequisites: ["ch01-introduction"]
    outline: |
      - TODO: 填写大纲
      - 该目录包含 $DIR_FILES 个文件
EOF
    CHAPTER_NUM=$((CHAPTER_NUM + 1))
  done <<< "$(find "$SCAN_PATH" -mindepth 1 -maxdepth 1 -type d \
    ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null | sort | head -12)"

  echo "═══════════════════════════════════════════════════"
  echo "  ⚠ 回退模式：骨架已生成: $OUTPUT_FILE"
  echo "  请手动编辑完善章节标题和大纲"
  echo "═══════════════════════════════════════════════════"
  exit 1
fi

# ═══════════════════════════════════════
#  Phase 3: 将 Claude 输出转换为 project.yaml
# ═══════════════════════════════════════
echo ""
echo "═══ Phase 3: 生成 project.yaml ═══"

# 优先用 Claude 推断的项目名
DISPLAY_NAME=$(jq -r '.project_name // empty' "$RESULT_FILE")
[ -z "$DISPLAY_NAME" ] && DISPLAY_NAME="$PROJECT_NAME"

SAFE_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
OUTPUT_FILE="$PROJECTS_DIR/$SAFE_NAME.yaml"

DESCRIPTION=$(jq -r '.description // "TODO: 填写项目简介"' "$RESULT_FILE")

# 写入 YAML 头部
cat > "$OUTPUT_FILE" <<EOF
name: "$DISPLAY_NAME"
repo_path: "$REPO_PATH"
target_dir: "$TARGET_DIR"
language: "$LANGUAGE"
description: "$DESCRIPTION"

book:
  title: "深入理解 $DISPLAY_NAME"
  subtitle: "一本由浅入深的交互式技术书"
  stats:
    files: $FILE_COUNT
    lines: $LINE_COUNT

chapters:
EOF

# 遍历 parts → chapters，生成 YAML
jq -c '.parts[]' "$RESULT_FILE" | while IFS= read -r part; do
  PART_TITLE=$(echo "$part" | jq -r '.part_title // ""')

  # 写入 Part 注释
  echo "" >> "$OUTPUT_FILE"
  echo "  # ──────────────────────────────" >> "$OUTPUT_FILE"
  echo "  # $PART_TITLE" >> "$OUTPUT_FILE"
  echo "  # ──────────────────────────────" >> "$OUTPUT_FILE"

  echo "$part" | jq -c '.chapters[]' | while IFS= read -r ch; do
    CH_ID=$(echo "$ch" | jq -r '.id')
    CH_TITLE=$(echo "$ch" | jq -r '.title')
    CH_SUBTITLE=$(echo "$ch" | jq -r '.subtitle // ""')
    CH_SOURCES=$(echo "$ch" | jq -r '.sources // ""')
    CH_PREREQS=$(echo "$ch" | jq -r '(.prerequisites // []) | map("\"" + . + "\"") | join(", ")')
    CH_OUTLINE=$(echo "$ch" | jq -r '.outline // ""')

    cat >> "$OUTPUT_FILE" <<EOF
  - id: $CH_ID
    title: "$CH_TITLE"
    subtitle: "$CH_SUBTITLE"
    sources: "$CH_SOURCES"
    prerequisites: [$CH_PREREQS]
    outline: |
EOF

    # 写入大纲（每行缩进 6 个空格）
    echo "$CH_OUTLINE" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      echo "      $line" >> "$OUTPUT_FILE"
    done
  done
done

# 统计实际章节数
ACTUAL_CHAPTERS=$(grep -c "^  - id:" "$OUTPUT_FILE" || echo "0")
ACTUAL_PARTS=$(jq '.parts | length' "$RESULT_FILE")

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ 项目配置已生成: $OUTPUT_FILE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  项目: $DISPLAY_NAME ($LANGUAGE)"
echo "  统计: $FILE_COUNT 文件, ~$LINE_COUNT 行代码"
echo "  结构: $ACTUAL_PARTS 个 Part, $ACTUAL_CHAPTERS 个章节"
echo ""
echo "  下一步:"
echo "  1. 查看: cat $OUTPUT_FILE"
echo "  2. 运行: bash run.sh --project $OUTPUT_FILE"
echo ""

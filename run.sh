#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  源码分析 Harness - 主循环驱动（通用版）
#  用法: bash harness/run.sh [--project path/to/project.yaml] [--max-hours 12] [--threshold 85]
#
#  循环: Plan → Analyze(并行) → Build Site(npm) → Evaluate
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── 路径配置 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HARNESS_DIR="$SCRIPT_DIR"
LOG_DIR="$HARNESS_DIR/output/logs"
STATE_FILE="$HARNESS_DIR/state.json"
GOALS_FILE="$HARNESS_DIR/goals.yaml"
WEBAPP_DIR="$HARNESS_DIR/web-app"
PROMPTS_DIR="$HARNESS_DIR/prompts"
LOCK_FILE="$HARNESS_DIR/.harness.lock"
CLAUDE_CMD="${CLAUDE_CMD:-claude}"

# ── 默认参数 ──
MAX_HOURS="${MAX_HOURS:-12}"
PASS_THRESHOLD="${PASS_THRESHOLD:-85}"
MAX_PARALLEL="${MAX_PARALLEL:-3}"
CLAUDE_TIMEOUT="${CLAUDE_TIMEOUT:-600}"
COOLDOWN="${COOLDOWN:-10}"
RESUME=false
PROJECT_FILE=""

# ── 命令行参数 ──
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)      PROJECT_FILE="$2"; shift 2 ;;
    --max-hours)    MAX_HOURS="$2"; shift 2 ;;
    --threshold)    PASS_THRESHOLD="$2"; shift 2 ;;
    --max-parallel) MAX_PARALLEL="$2"; shift 2 ;;
    --resume)       RESUME=true; shift ;;
    --help)
      echo "用法: bash run.sh [OPTIONS]"
      echo "  --project FILE    项目配置文件(默认 projects/claude-code.yaml)"
      echo "  --max-hours N     最大运行时间(默认12)"
      echo "  --threshold N     达标分数(默认85)"
      echo "  --max-parallel N  最大并行分析数(默认3)"
      echo "  --resume          从上次状态继续"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── 加载项目配置 ──
PROJECT_FILE="${PROJECT_FILE:-$HARNESS_DIR/projects/claude-code.yaml}"
if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: Project file not found: $PROJECT_FILE"
  exit 1
fi

# 从 project yaml 解析配置
BOOK_TITLE=$(grep "^  title:" "$PROJECT_FILE" | head -1 | sed 's/.*title: *//' | tr -d '"')
PROJECT_ROOT=$(grep "^repo_path:" "$PROJECT_FILE" | sed 's/.*repo_path: *//' | tr -d '"')
PROJECT_NAME=$(grep "^name:" "$PROJECT_FILE" | head -1 | sed 's/.*name: *//' | tr -d '"')
TARGET_DIR=$(grep "^target_dir:" "$PROJECT_FILE" | sed 's/.*target_dir: *//' | tr -d '"')
PROJECT_LANG=$(grep "^language:" "$PROJECT_FILE" | sed 's/.*language: *//' | tr -d '"')
PROJECT_DESC=$(grep "^description:" "$PROJECT_FILE" | sed 's/.*description: *//' | tr -d '"')

# 允许环境变量覆盖
PROJECT_ROOT="${PROJECT_ROOT_OVERRIDE:-$PROJECT_ROOT}"

# ── 项目命名空间的知识目录 ──
KNOWLEDGE_DIR="$HARNESS_DIR/knowledge/$PROJECT_NAME"
CHAPTERS_DIR="$KNOWLEDGE_DIR/chapters"
MODULES_DIR="$KNOWLEDGE_DIR/modules"

# ── 目录初始化 ──
mkdir -p "$MODULES_DIR" "$CHAPTERS_DIR" "$LOG_DIR"

# ── Lock 文件防止重复运行 ──
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "ERROR: Harness already running (PID $LOCK_PID). Use 'kill $LOCK_PID' to stop it."
    exit 1
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── macOS 兼容: timeout 替代 ──
if command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
else
  # 纯 bash fallback: 后台运行 + 超时 kill
  timeout() {
    local secs="$1"; shift
    "$@" &
    local pid=$!
    (sleep "$secs" && kill "$pid" 2>/dev/null) &
    local watcher=$!
    wait "$pid" 2>/dev/null
    local ret=$?
    kill "$watcher" 2>/dev/null
    wait "$watcher" 2>/dev/null
    return $ret
  }
  TIMEOUT_CMD="timeout"
fi

# ── 颜色 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── 日志 (文件锁防并发写) ──
log() {
  local level="$1"; shift
  local msg="$*"
  local ts
  ts=$(date '+%H:%M:%S')
  case $level in
    INFO)  echo -e "${CYAN}[$ts]${NC} $msg" ;;
    OK)    echo -e "${GREEN}[$ts] ✓${NC} $msg" ;;
    WARN)  echo -e "${YELLOW}[$ts] ⚠${NC} $msg" ;;
    ERROR) echo -e "${RED}[$ts] ✗${NC} $msg" ;;
    STEP)  echo -e "${BLUE}[$ts] ▶${NC} ${BOLD}$msg${NC}" ;;
    HEAD)  echo -e "\n${BOLD}${CYAN}═══ [$ts] $msg ═══${NC}" ;;
  esac
  echo "[$ts] [$level] $msg" >> "$LOG_DIR/harness.log"
}

elapsed_hours() {
  echo "scale=2; ($(date +%s) - $START_TIME) / 3600" | bc
}

update_state() {
  local tmp
  tmp=$(mktemp)
  if jq "$@" "$STATE_FILE" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$STATE_FILE"
  else
    rm -f "$tmp"
    log WARN "Failed to update state"
  fi
}

# ── Claude 执行器 ──
run_claude() {
  local step_name="$1"
  local prompt_file="$2"
  local output_file="$3"
  local max_turns="${4:-30}"
  local allowed_tools="${5:-Read,Glob,Grep}"

  log STEP "Running: $step_name"

  local err_file="$LOG_DIR/${step_name}.err"
  local raw_file="$LOG_DIR/${step_name}.raw.json"

  if $TIMEOUT_CMD "$CLAUDE_TIMEOUT" $CLAUDE_CMD -p "$(cat "$prompt_file")" \
    --output-format json \
    --max-turns "$max_turns" \
    --allowedTools "$allowed_tools" \
    2>> "$err_file" \
    > "$raw_file"; then

    # 提取 result 字段，或者整个文件
    if jq -e '.result' "$raw_file" > /dev/null 2>&1; then
      jq -r '.result' "$raw_file" > "$output_file"
    else
      cp "$raw_file" "$output_file"
    fi

    # 清理 markdown 代码块包裹: ```json ... ``` (各种变体)
    if head -1 "$output_file" | grep -q '^\`\`\`'; then
      # 删除第一行的 ```json 或 ``` 以及最后一行的 ```
      sed -i.bak '1{/^```/d;}' "$output_file" 2>/dev/null || true
      sed -i.bak '${/^```/d;}' "$output_file" 2>/dev/null || true
      rm -f "${output_file}.bak"
    fi

    # 验证: 如果输出应该是 JSON 但不合法，提取 { ... } 部分
    if echo "$output_file" | grep -qE '\.json$'; then
      if ! jq empty "$output_file" 2>/dev/null; then
        # 尝试提取第一个 { 到最后一个 } 之间的内容
        local first_brace last_brace extracted
        first_brace=$(grep -n '{' "$output_file" | head -1 | cut -d: -f1)
        if [ -n "$first_brace" ]; then
          last_brace=$(grep -n '}' "$output_file" | tail -1 | cut -d: -f1)
          if [ -n "$last_brace" ] && [ "$last_brace" -ge "$first_brace" ]; then
            extracted=$(sed -n "${first_brace},${last_brace}p" "$output_file")
            if echo "$extracted" | jq empty 2>/dev/null; then
              echo "$extracted" > "$output_file"
              log INFO "  Cleaned non-JSON prefix from $step_name output"
            fi
          fi
        fi
      fi
    fi

    log OK "$step_name completed ($(wc -c < "$output_file" | tr -d ' ') bytes)"
    return 0
  else
    local exit_code=$?
    log ERROR "$step_name failed (exit=$exit_code)"
    echo "{\"error\": \"step $step_name failed with exit code $exit_code\"}" > "$output_file"
    return 1
  fi
}

# 从 JSON 中安全提取 score (处理各种嵌套情况)
extract_score() {
  local file="$1"
  local score

  # 方法1: 直接 jq
  score=$(jq -r '.score // empty' "$file" 2>/dev/null || true)
  if [[ "$score" =~ ^[0-9]+$ ]]; then echo "$score"; return; fi

  # 方法2: 正则搜索
  score=$(grep -oE '"score"\s*:\s*[0-9]+' "$file" 2>/dev/null | head -1 | grep -oE '[0-9]+$' || true)
  if [[ "$score" =~ ^[0-9]+$ ]]; then echo "$score"; return; fi

  echo "0"
}

# 从 project yaml 中提取章节列表（所有 id）
get_all_chapter_ids() {
  sed -n '/^chapters:/,/^[a-z]/p' "$PROJECT_FILE" | grep "^  - id:" | sed 's/.*id: *//' | tr -d '"'
}

# 从 project yaml 中提取章节信息
get_chapter_field() {
  local chapter_id="$1"
  local field="$2"
  sed -n "/id: $chapter_id/,/^  - id:/p" "$PROJECT_FILE" | grep "$field:" | head -1 | sed "s/.*$field: *//" | tr -d '"'
}

# 总章节数
get_total_chapters() {
  get_all_chapter_ids | wc -l | tr -d ' '
}

# ═══════════════════════════════════════
#  Step 1: 制定计划
# ═══════════════════════════════════════
step_plan() {
  local iteration="$1"
  local last_eval="${2:-}"

  local existing
  existing=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | xargs -I{} basename {} .json | tr '\n' ',' || echo "none")

  local prompt_file="$LOG_DIR/_prompt_plan_iter${iteration}.md"

  cat > "$prompt_file" <<PROMPT
你是《${BOOK_TITLE}》的编辑。制定下一轮写作计划。

## 当前状态
$(cat "$STATE_FILE")

## 已写章节
$existing

## 迭代轮次
$iteration

## 上轮多维度评估反馈
${last_eval:-无（第一轮）}

## 书的章节目录
$(sed -n '/^chapters:/,$p' "$PROJECT_FILE")

## 规则
1. 每轮选 2-3 个未写的章节并行撰写
2. 按章节顺序优先（ch01 先于 ch02）
3. 如果章节已存在但质量不够，可以选择重写
4. 参考上轮评估反馈调整策略：
   - 如果 **内容分** 低 → 优先写新章节或重写薄弱章节
   - 如果 **视觉分** 低 → 标记 needs_webapp_improve=true，后续 improve 步骤会修复
   - 如果 **交互分** 低 → 标记 needs_webapp_improve=true，专注交互功能修复
5. 当所有章节已写完且内容分高时，focus 应转向 webapp 改进

## 输出：纯 JSON（不要代码块包裹）
{
  "plan_summary": "本轮计划...",
  "chapters_to_write": [{"id": "ch01-xxx", "focus": "重点"}],
  "needs_webapp_improve": true,
  "webapp_improve_focus": "visual|interaction|both|none",
  "improvement_focus": "coverage|depth|readability|webapp"
}
PROMPT

  run_claude "plan_iter${iteration}" "$prompt_file" "$LOG_DIR/plan_iter${iteration}.json" 15
}

# ═══════════════════════════════════════
#  Step 2: 并行撰写章节
# ═══════════════════════════════════════
step_analyze() {
  local iteration="$1"
  local plan_file="$LOG_DIR/plan_iter${iteration}.json"

  # 提取要写的章节列表
  local chapters_list
  chapters_list=$(jq -r '.chapters_to_write[]? | .id' "$plan_file" 2>/dev/null || echo "")
  # 兼容旧字段名
  if [ -z "$chapters_list" ]; then
    chapters_list=$(jq -r '.modules_to_analyze[]? | .id' "$plan_file" 2>/dev/null || echo "")
  fi

  if [ -z "$chapters_list" ]; then
    log WARN "No chapters in plan, computing fallback from unwritten chapters"
    local all_ids
    all_ids=$(get_all_chapter_ids)
    local written
    written=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | xargs -I{} basename {} .json)
    chapters_list=""
    local count=0
    for cid in $all_ids; do
      if ! echo "$written" | grep -qx "$cid"; then
        chapters_list="$chapters_list $cid"
        count=$((count + 1))
        if (( count >= MAX_PARALLEL )); then break; fi
      fi
    done
    chapters_list=$(echo "$chapters_list" | xargs)
    if [ -z "$chapters_list" ]; then
      chapters_list=$(echo "$all_ids" | head -3 | tr '\n' ' ')
    fi
    log INFO "  Fallback chapters: $chapters_list"
  fi

  local -a active_pids=()
  local launched=0
  local failed=0

  for chapter_id in $chapters_list; do
    # 等待空位
    while (( ${#active_pids[@]} >= MAX_PARALLEL )); do
      local -a new_pids=()
      for pid in "${active_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
          new_pids+=("$pid")
        else
          wait "$pid" 2>/dev/null || failed=$((failed + 1))
        fi
      done
      active_pids=("${new_pids[@]}")
      if (( ${#active_pids[@]} >= MAX_PARALLEL )); then sleep 1; fi
    done

    # 从 project yaml 提取章节信息
    local ch_title ch_subtitle ch_sources ch_outline
    ch_title=$(get_chapter_field "$chapter_id" "title")
    ch_subtitle=$(get_chapter_field "$chapter_id" "subtitle")
    ch_sources=$(get_chapter_field "$chapter_id" "sources")
    ch_outline=$(sed -n "/id: $chapter_id/,/^  - id:/p" "$PROJECT_FILE" | sed -n '/outline: |/,/^    [a-z]/p' | grep -v 'outline:' | sed 's/^      //')

    local prompt_file="$LOG_DIR/_prompt_write_${chapter_id}.md"
    cat > "$prompt_file" <<PROMPT
你是一位顶级技术科普作家，擅长用渐进式叙事把复杂技术讲得深入浅出。请为《${BOOK_TITLE}》撰写一个章节。

## 项目信息
- 项目: $PROJECT_NAME
- 语言: $PROJECT_LANG
- 简介: $PROJECT_DESC

## 章节信息
- ID: $chapter_id
- 标题: $ch_title
- 副标题: $ch_subtitle
- 源码路径: $ch_sources
- 项目根目录: $PROJECT_ROOT
- 目标目录: $TARGET_DIR

## 大纲
$ch_outline

## 写作方法论（极其重要！）

### 渐进式写作结构——每节必须遵循：
1. **为什么**：先解释为什么需要这个机制，用一个实际场景或痛点引入
2. **直觉/比喻**：用日常比喻建立直觉（如：MCP 像 USB 接口，Tool 像瑞士军刀）
3. **图示/表格**：用 Mermaid 图或对比表格直观展示结构
4. **精确定义**：给出技术层面的精确解释
5. **代码示例**：仅贴最核心 10-20 行代码，配前后文详解

### 写作要求
1. **70% 文字叙述 + 30% 代码/图表**。这是一本书，不是 API 文档！
2. 每章 3000-5000 字，用讲故事的方式解释技术
3. **opening_hook** 必须用具体场景开头（如："当你输入第一个 prompt 按下回车的那一刻，发生了什么？"），200-400 字
4. **chapter_summary** 用一句话概括本章核心观点
5. 正文分 4-6 个小节，每节 500-1000 字
6. 至少用 2 个比喻帮助理解
7. 必须有至少 1 个 Mermaid 架构/流程图
8. 章末 3-5 个要点总结 + 1-2 个延伸思考

### 段落要求（影响排版！）
- **content** 字段：每段 2-4 句话，段与段之间用 \\n\\n 分隔
- 禁止 200+ 字不分段的大段文字
- 每段聚焦一个论点，形成"总-分-总"节奏

### Callout 和 Table
- 每节可选附带 **callout**（提示框）和 **table**（对比表格）
- callout 适用于：关键提醒(tip)、易错点(warning)、补充信息(info)、名人名言(quote)
- table 适用于：概念对比、参数列表、方案优劣

## 禁止
- ❌ 不要连续列出 5+ 个 type 定义
- ❌ 不要贴超过 20 行的代码块
- ❌ 不要干巴巴列清单，要有叙事和解释
- ❌ 不要执行 git 命令
- ❌ 不要使用 Write/Edit 工具写文件！你的 JSON 输出就是最终结果！

## 步骤
1. 先用 Read/Glob/Grep 阅读 $PROJECT_ROOT/$ch_sources 中的源码
2. 理解设计意图和实现细节
3. **直接在你的回复中输出完整的 JSON**（不要用 Write 工具写文件！）
4. 用通俗易懂的方式写出章节内容

## 输出要求（极其重要！！）
你的回复必须是且仅是一个完整的 JSON 对象。不要写任何其他文字。
不要写"我已完成"之类的总结。不要用 Write 工具。直接输出 JSON：
{
  "chapter_id": "$chapter_id",
  "title": "$ch_title",
  "subtitle": "$ch_subtitle",
  "chapter_summary": "本章一句话概要...",
  "opening_hook": "200-400字的开篇引子，用具体场景开头...",
  "sections": [
    {
      "heading": "小节标题",
      "content": "段落1（2-4句）\\n\\n段落2（2-4句）\\n\\n段落3（2-4句）",
      "callout": {"type":"tip|warning|info|quote","text":"关键提示内容"},
      "table": {"caption":"表标题","headers":["列1","列2","列3"],"rows":[["值1","值2","值3"]]},
      "code": {"title":"代码标题","description":"说明","code":"代码","language":"$(echo "$PROJECT_LANG" | tr 'A-Z' 'a-z')","annotation":"解读"},
      "diagram": {"title":"图标题","chart":"graph TD; ...","description":"图说明"}
    }
  ],
  "key_takeaways": ["要点1","要点2","要点3"],
  "further_thinking": ["思考题1","思考题2"],
  "analogies": ["比喻1","比喻2"],
  "mermaid_diagrams": [],
  "code_snippets": [],
  "word_count": 3500,
  "prerequisites": []
}

注意：callout 和 table 是可选字段，只在合适的小节中添加。不要每节都加。
PROMPT

    (
      run_claude "write_${chapter_id}_iter${iteration}" "$prompt_file" "$CHAPTERS_DIR/${chapter_id}.json" 50
    ) &
    active_pids+=($!)
    launched=$((launched + 1))
    log INFO "  Writing: $chapter_id ($ch_title)"
  done

  for pid in "${active_pids[@]}"; do
    wait "$pid" 2>/dev/null || failed=$((failed + 1))
  done

  log OK "Chapter writing: $((launched - failed))/$launched succeeded"

  # 更新状态
  local written
  written=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | xargs -I{} basename {} .json | jq -R . | jq -s . 2>/dev/null || echo "[]")
  update_state --argjson modules "$written" '.modules_analyzed = $modules'
}

# ═══════════════════════════════════════
#  Step 2.5: 改进 Web App（自我修复）
# ═══════════════════════════════════════
step_improve_webapp() {
  local iteration="$1"
  local last_eval="${2:-}"

  # ── Component file path map ──
  local MERMAID_FILE="web-app/components/MermaidDiagram.tsx"
  local CODEBLOCK_FILE="web-app/components/CodeBlock.tsx"
  local SEARCH_FILE="web-app/components/SearchClient.tsx"

  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"

  # ── Task 3.1: Extract diagnostic signals from eval JSON ──
  local diagnostic_block=""
  local has_eval_data=false

  # Find the latest eval files for this or previous iteration
  local eval_visual_file="" eval_interaction_file=""
  for i in $(seq "$iteration" -1 1); do
    if [ -z "$eval_visual_file" ] && [ -f "$LOG_DIR/eval_visual_iter${i}.json" ]; then
      eval_visual_file="$LOG_DIR/eval_visual_iter${i}.json"
    fi
    if [ -z "$eval_interaction_file" ] && [ -f "$LOG_DIR/eval_interaction_iter${i}.json" ]; then
      eval_interaction_file="$LOG_DIR/eval_interaction_iter${i}.json"
    fi
    [ -n "$eval_visual_file" ] && [ -n "$eval_interaction_file" ] && break
  done

  if [ -n "$eval_visual_file" ] || [ -n "$eval_interaction_file" ]; then
    has_eval_data=true

    # ── Task 3.2: Build structured diagnostic JSON block ──
    # Extract issues and suggestions from eval files
    local visual_issues="" visual_suggestions="" visual_mermaid_score=0
    local interaction_issues="" interaction_suggestions=""
    local interaction_code_score=0 interaction_search_score=0

    if [ -n "$eval_visual_file" ]; then
      visual_issues=$(jq -c '.issues // []' "$eval_visual_file" 2>/dev/null || echo "[]")
      visual_suggestions=$(jq -c '.suggestions // []' "$eval_visual_file" 2>/dev/null || echo "[]")
      visual_mermaid_score=$(jq '.breakdown.mermaid // 0' "$eval_visual_file" 2>/dev/null || echo "0")
    fi
    if [ -n "$eval_interaction_file" ]; then
      interaction_issues=$(jq -c '.issues // []' "$eval_interaction_file" 2>/dev/null || echo "[]")
      interaction_suggestions=$(jq -c '.suggestions // []' "$eval_interaction_file" 2>/dev/null || echo "[]")
      interaction_code_score=$(jq '.breakdown.code_highlight // 0' "$eval_interaction_file" 2>/dev/null || echo "0")
      interaction_search_score=$(jq '.breakdown.search // 0' "$eval_interaction_file" 2>/dev/null || echo "0")
    fi

    [[ "$visual_mermaid_score" =~ ^[0-9]+$ ]] || visual_mermaid_score=0
    [[ "$interaction_code_score" =~ ^[0-9]+$ ]] || interaction_code_score=0
    [[ "$interaction_search_score" =~ ^[0-9]+$ ]] || interaction_search_score=0

    # Build per-component diagnostic objects, ordered by score impact (mermaid 8 > code 5 > search 4)
    local components_json="["

    # Mermaid component (8 pts potential)
    local mermaid_status="OK"
    local mermaid_diagnosis="" mermaid_hint=""
    (( visual_mermaid_score == 0 )) && mermaid_status="BROKEN"
    (( visual_mermaid_score > 0 && visual_mermaid_score < 8 )) && mermaid_status="DEGRADED"
    if [ "$mermaid_status" != "OK" ]; then
      mermaid_diagnosis=$(echo "$visual_issues" | jq -r '.[] | select(test("MermaidDiagram|mermaid"; "i"))' 2>/dev/null | head -1)
      mermaid_hint=$(echo "$visual_suggestions" | jq -r '.[] | select(test("MermaidDiagram|mermaid"; "i"))' 2>/dev/null | head -1)
    fi
    components_json="${components_json}{\"component\":\"MermaidDiagram\",\"file\":\"${MERMAID_FILE}\",\"status\":\"${mermaid_status}\",\"score_impact\":8,\"diagnosis\":$(echo "${mermaid_diagnosis:-No issues detected}" | jq -Rs .),\"fix_hint\":$(echo "${mermaid_hint:-N/A}" | jq -Rs .)},"

    # CodeBlock component (5 pts potential)
    local code_status="OK"
    local code_diagnosis="" code_hint=""
    (( interaction_code_score == 0 )) && code_status="BROKEN"
    if [ "$code_status" != "OK" ]; then
      code_diagnosis=$(echo "$interaction_issues" | jq -r '.[] | select(test("CodeBlock|code|pre"; "i"))' 2>/dev/null | head -1)
      code_hint=$(echo "$interaction_suggestions" | jq -r '.[] | select(test("CodeBlock|shiki|highlight"; "i"))' 2>/dev/null | head -1)
    fi
    components_json="${components_json}{\"component\":\"CodeBlock\",\"file\":\"${CODEBLOCK_FILE}\",\"status\":\"${code_status}\",\"score_impact\":5,\"diagnosis\":$(echo "${code_diagnosis:-No issues detected}" | jq -Rs .),\"fix_hint\":$(echo "${code_hint:-N/A}" | jq -Rs .)},"

    # SearchClient component (4 pts potential)
    local search_status="OK"
    local search_diagnosis="" search_hint=""
    (( interaction_search_score < 8 )) && search_status="BROKEN"
    (( interaction_search_score >= 4 && interaction_search_score < 8 )) && search_status="DEGRADED"
    if [ "$search_status" != "OK" ]; then
      search_diagnosis=$(echo "$interaction_issues" | jq -r '.[] | select(test("SearchClient|search"; "i"))' 2>/dev/null | head -1)
      search_hint=$(echo "$interaction_suggestions" | jq -r '.[] | select(test("SearchClient|search"; "i"))' 2>/dev/null | head -1)
    fi
    components_json="${components_json}{\"component\":\"SearchClient\",\"file\":\"${SEARCH_FILE}\",\"status\":\"${search_status}\",\"score_impact\":4,\"diagnosis\":$(echo "${search_diagnosis:-No issues detected}" | jq -Rs .),\"fix_hint\":$(echo "${search_hint:-N/A}" | jq -Rs .)}]"

    diagnostic_block=$(echo "$components_json" | jq '.' 2>/dev/null || echo "$components_json")
  fi

  # ── Task 3.3: Extract and filter console errors from report.json ──
  local console_errors_section=""
  if [ -f "$screenshot_report" ]; then
    local mermaid_console_errors code_console_errors other_console_errors
    mermaid_console_errors=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.categorizedErrors.mermaid // [] | .[]] | unique | .[]' "$screenshot_report" 2>/dev/null || true)
    code_console_errors=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.categorizedErrors.shiki // [] | .[]] | unique | .[]' "$screenshot_report" 2>/dev/null || true)
    # Filter noise from other errors (favicon, empty, etc.)
    other_console_errors=$(jq -r '[.pages | to_entries[] | .value.categorizedErrors.other // [] | .[]] | unique | map(select(test("favicon|ERR_FILE_NOT_FOUND"; "i") | not)) | .[]' "$screenshot_report" 2>/dev/null || true)

    if [ -n "$mermaid_console_errors" ] || [ -n "$code_console_errors" ] || [ -n "$other_console_errors" ]; then
      console_errors_section="## Console Errors (from visual test)
"
      if [ -n "$mermaid_console_errors" ]; then
        console_errors_section="${console_errors_section}
### Mermaid-related errors:
${mermaid_console_errors}
"
      fi
      if [ -n "$code_console_errors" ]; then
        console_errors_section="${console_errors_section}
### Code highlighting errors:
${code_console_errors}
"
      fi
      if [ -n "$other_console_errors" ]; then
        console_errors_section="${console_errors_section}
### Other console errors:
${other_console_errors}
"
      fi
    fi
  fi

  # 获取截图文件列表
  local screenshot_files=""
  if [ -d "$HARNESS_DIR/output/screenshots" ]; then
    screenshot_files=$(ls "$HARNESS_DIR/output/screenshots"/*.png 2>/dev/null | head -10 | tr '\n' '\n')
  fi

  local prompt_file="$LOG_DIR/_prompt_improve_iter${iteration}.md"

  # ── Task 3.5: Fallback for missing eval data ──
  local diagnostic_section=""
  if [ "$has_eval_data" = true ]; then
    # ── Task 3.4: Structured diagnostic block replaces generic guidance ──
    diagnostic_section="## Component Diagnostics (from eval — FIX THESE)

The following diagnostics identify exactly which components are broken and why. Fix components marked BROKEN first (highest score impact first). Skip components marked OK.

\`\`\`json
${diagnostic_block}
\`\`\`

${console_errors_section}"
  else
    diagnostic_section="## Component Diagnostics (first iteration — no eval data yet)

No previous evaluation data available. Check each component file for basic rendering:

1. **MermaidDiagram** at \`${MERMAID_FILE}\` (8pts): Verify mermaid is imported, initialized in useEffect, and renders SVGs in .mermaid containers
2. **CodeBlock** at \`${CODEBLOCK_FILE}\` (5pts): Verify shiki/highlight.js is imported and applies syntax highlighting to <pre>/<code> elements
3. **SearchClient** at \`${SEARCH_FILE}\` (4pts): Verify chapter data is loaded for indexing and filter function produces results

${console_errors_section}"
  fi

  cat > "$prompt_file" <<PROMPT
你是一个 Web 前端修复专家。你需要根据精确的组件诊断数据，修复 Web App 中特定组件的 bug。

## ⚠️ 重要限制
- 你只能修改 ${WEBAPP_DIR}/ 下的文件
- 不要修改 knowledge/ 目录下的 JSON 数据文件
- 不要修改 run.sh 或 scripts/ 下的文件
- 不要创建新的顶级目录

## 当前项目
- 项目: ${PROJECT_NAME}
- Web App 目录: ${WEBAPP_DIR}
- 这是一个 Next.js 14 静态站点

${diagnostic_section}

## 上轮评估反馈
${last_eval:-无}

## 截图文件（你可以用 Read 工具查看）
${screenshot_files}

## 步骤
1. 对于每个 BROKEN 组件，先用 Read 读取诊断中指定的文件
2. 根据 diagnosis 和 fix_hint 定位问题根因
3. 用 Edit/Write 修复 bug
4. 按 score_impact 从高到低修复（先修 mermaid 8pts，再修 code 5pts，最后 search 4pts）
5. 每次修改都要确保不破坏现有功能

## 输出
完成修改后，输出纯 JSON 总结：
{"changes_made": ["修改了xxx"], "files_modified": ["path/to/file"], "issues_fixed": ["问题1"], "issues_remaining": ["遗留问题"]}
PROMPT

  run_claude "improve_webapp_iter${iteration}" "$prompt_file" \
    "$LOG_DIR/improve_iter${iteration}.json" 40 \
    "Read,Glob,Grep,Write,Edit"
}

# ═══════════════════════════════════════
#  Step 2.7: 代码审查（只读）
# ═══════════════════════════════════════
step_code_review() {
  local iteration="$1"

  # 获取 improve 步骤改了什么
  local diff=""
  if git -C "$HARNESS_DIR" rev-parse --git-dir &>/dev/null; then
    diff=$(git -C "$HARNESS_DIR" diff web-app/ 2>/dev/null || echo "no git diff available")
  else
    diff="no git repo, cannot diff"
  fi

  if [ "$diff" = "" ] || [ "$diff" = "no git repo, cannot diff" ]; then
    log INFO "Code review: no webapp changes to review"
    echo '{"approved": true, "issues": [], "suggestions": ["No changes to review"]}' > "$LOG_DIR/review_iter${iteration}.json"
    return 0
  fi

  local prompt_file="$LOG_DIR/_prompt_review_iter${iteration}.md"
  cat > "$prompt_file" <<PROMPT
你是一个代码审查专家。请审查以下对 Web App 的改动。

## Git Diff（web-app/ 目录的改动）
\`\`\`diff
${diff}
\`\`\`

## 审查重点
1. 改动是否会引入新 bug？
2. 是否有语法错误或类型错误？
3. 是否遵循 React 最佳实践？
4. 是否有安全问题（XSS 等）？
5. 改动是否与原始意图一致？

## 输出纯 JSON
{
  "approved": true,
  "severity": "none|low|medium|high|critical",
  "issues": ["问题描述"],
  "suggestions": ["改进建议"]
}

如果 severity 是 critical 或 high，设置 approved=false。
PROMPT

  run_claude "review_iter${iteration}" "$prompt_file" \
    "$LOG_DIR/review_iter${iteration}.json" 10

  # 检查审查结果，如果不通过则 revert
  local approved
  approved=$(jq -r '.approved // true' "$LOG_DIR/review_iter${iteration}.json" 2>/dev/null || echo "true")
  local severity
  severity=$(jq -r '.severity // "none"' "$LOG_DIR/review_iter${iteration}.json" 2>/dev/null || echo "none")

  if [ "$approved" = "false" ] && [ "$severity" = "critical" ]; then
    log WARN "Code review REJECTED (critical severity). Reverting webapp changes..."
    git -C "$HARNESS_DIR" checkout web-app/ 2>/dev/null || true
    return 1
  elif [ "$approved" = "false" ]; then
    log WARN "Code review flagged issues (severity: $severity) but not reverting"
    return 0
  else
    log OK "Code review approved"
    return 0
  fi
}

# ═══════════════════════════════════════
#  Step 3: 构建网站 (npm run build)
# ═══════════════════════════════════════
step_build_site() {
  log STEP "Building Next.js site..."

  if [ ! -d "$WEBAPP_DIR/node_modules" ]; then
    log INFO "Installing web-app dependencies..."
    (cd "$WEBAPP_DIR" && npm install --silent 2>&1) || {
      log ERROR "npm install failed"
      return 1
    }
  fi

  # 清理 .next 缓存确保读取最新 knowledge 数据
  rm -rf "$WEBAPP_DIR/.next"

  if (cd "$WEBAPP_DIR" && KNOWLEDGE_PROJECT="$PROJECT_NAME" npx next build 2>> "$LOG_DIR/next-build.err"); then
    local out_size
    out_size=$(du -sh "$WEBAPP_DIR/out" 2>/dev/null | cut -f1 || echo "?")
    log OK "Site built successfully ($out_size)"
    return 0
  else
    log ERROR "Next.js build failed (see $LOG_DIR/next-build.err)"
    return 1
  fi
}

# ═══════════════════════════════════════
#  Step 3.5: 视觉测试 (Playwright 截图)
# ═══════════════════════════════════════
step_visual_test() {
  if [ ! -d "$WEBAPP_DIR/out" ]; then
    log WARN "No build output, skipping visual test"
    return 1
  fi

  log STEP "Running Playwright visual test..."
  local screenshot_dir="$HARNESS_DIR/output/screenshots"
  mkdir -p "$screenshot_dir"

  if NODE_PATH="$WEBAPP_DIR/node_modules" node "$HARNESS_DIR/scripts/visual-test.js" \
    "$WEBAPP_DIR/out" "$screenshot_dir" 2>> "$LOG_DIR/visual-test.err"; then
    log OK "Visual test passed"
    return 0
  else
    log WARN "Visual test found issues (see report)"
    return 0  # 不因为 console errors 阻塞循环
  fi
}

# ═══════════════════════════════════════
#  Step 4: 多维度并行评估
# ═══════════════════════════════════════

# 构建章节摘要（复用）
_build_chapter_summary() {
  local chapter_summary=""
  for f in "$CHAPTERS_DIR"/*.json; do
    if [ -f "$f" ]; then
      local cid csize ctitle csections cwords
      cid=$(basename "$f" .json)
      csize=$(wc -c < "$f" | tr -d ' ')
      ctitle=$(jq -r '.title // "unknown"' "$f" 2>/dev/null || echo "?")
      csections=$(jq '.sections | length' "$f" 2>/dev/null || echo "0")
      cwords=$(jq '.word_count // 0' "$f" 2>/dev/null || echo "0")
      chapter_summary="$chapter_summary
- $cid: $ctitle | ${csize}B | ${csections} sections | ${cwords} words"
    fi
  done
  echo "$chapter_summary"
}

# 内容质量评分 (40分) — 确定性公式计算
eval_content() {
  local iteration="$1"

  local analysis_count
  analysis_count=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  local total_chapters
  total_chapters=$(get_total_chapters)

  # 避免除零
  [[ "$total_chapters" -eq 0 ]] && total_chapters=1
  [[ "$analysis_count" -eq 0 ]] && analysis_count=0

  # 覆盖率 (15分): analysis_count / total_chapters * 15
  local coverage=$(( analysis_count * 15 / total_chapters ))

  # 遍历章节统计 volume 和 depth
  local vol_count=0 depth_a_count=0 depth_b_count=0
  for f in "$CHAPTERS_DIR"/*.json; do
    [ -f "$f" ] || continue
    local fsize sections wcount
    fsize=$(wc -c < "$f" | tr -d ' ')
    sections=$(jq '.sections | length' "$f" 2>/dev/null || echo "0")
    wcount=$(jq '.word_count // 0' "$f" 2>/dev/null || echo "0")
    [[ "$sections" =~ ^[0-9]+$ ]] || sections=0
    [[ "$wcount" =~ ^[0-9]+$ ]] || wcount=0

    # 内容量: > 10KB 且 sections >= 4
    if (( fsize > 10240 && sections >= 4 )); then
      vol_count=$((vol_count + 1))
    fi
    # 叙事深度 a: word_count >= 3000 且 sections >= 4
    if (( wcount >= 3000 && sections >= 4 )); then
      depth_a_count=$((depth_a_count + 1))
    fi
    # 叙事深度 b: sections >= 5
    if (( sections >= 5 )); then
      depth_b_count=$((depth_b_count + 1))
    fi
  done

  local safe_count=$analysis_count
  [[ "$safe_count" -eq 0 ]] && safe_count=1

  local volume=$(( vol_count * 15 / safe_count ))
  local depth_a=$(( depth_a_count * 5 / safe_count ))
  local depth_b=$(( depth_b_count * 5 / safe_count ))
  local depth=$(( depth_a + depth_b ))
  local content_score=$(( coverage + volume + depth ))

  # 生成 issues/suggestions
  local issues="[]" suggestions="[]"
  if (( coverage < 15 )); then
    issues=$(echo "$issues" | jq --arg m "覆盖率不足: $analysis_count/$total_chapters 章节已写" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["继续撰写未完成的章节"]')
  fi
  if (( volume < 10 )); then
    issues=$(echo "$issues" | jq --arg m "内容量不足: $vol_count/$analysis_count 章节达到 10KB+4sections 标准" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["增加章节内容深度和小节数量"]')
  fi
  if (( depth < 6 )); then
    issues=$(echo "$issues" | jq --arg m "叙事深度不足: word_count>=3000的章节比例偏低" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["扩充章节字数到3000-5000范围"]')
  fi

  cat > "$LOG_DIR/eval_content_iter${iteration}.json" <<EOF
{
  "dimension": "content",
  "score": $content_score,
  "max_score": 40,
  "breakdown": {"coverage": $coverage, "volume": $volume, "depth": $depth},
  "issues": $issues,
  "suggestions": $suggestions
}
EOF

  log OK "eval_content: $content_score/40 (cov=$coverage vol=$volume depth=$depth)"
}

# 视觉质量评分 (35分) — 确定性公式计算
eval_visual() {
  local iteration="$1"
  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"

  # 构建状态 (10分)
  local build_score=0
  [ -d "$WEBAPP_DIR/out" ] && build_score=10

  # ── Component file path map (static, update if components are renamed) ──
  local MERMAID_FILE="web-app/components/MermaidDiagram.tsx"
  local CODEBLOCK_FILE="web-app/components/CodeBlock.tsx"
  local SEARCH_FILE="web-app/components/SearchClient.tsx"

  # 从 report.json 提取 metrics
  local total_errors=0 mermaid_rendered=0 mermaid_errors=0
  local has_sidebar="false" has_dark_mode="false"
  local home_card_count=0 home_body_text=0

  # Diagnostic aggregates across chapter pages
  local diag_mermaid_js_loaded="false"
  local diag_mermaid_containers=0 diag_mermaid_svgs=0
  local diag_mermaid_render_errors=""
  local diag_mermaid_console_errors=""

  if [ -f "$screenshot_report" ]; then
    total_errors=$(jq '.summary.totalErrors // 0' "$screenshot_report" 2>/dev/null || echo "0")
    mermaid_rendered=$(jq '.summary.totalMermaidRendered // 0' "$screenshot_report" 2>/dev/null || echo "0")
    mermaid_errors=$(jq '.summary.totalMermaidErrors // 0' "$screenshot_report" 2>/dev/null || echo "0")
    has_sidebar=$(jq -r '.pages.home.metrics.hasSidebar // false' "$screenshot_report" 2>/dev/null || echo "false")
    has_dark_mode=$(jq -r '.pages.home.metrics.hasDarkModeToggle // false' "$screenshot_report" 2>/dev/null || echo "false")
    home_card_count=$(jq '.pages.home.metrics.cardCount // 0' "$screenshot_report" 2>/dev/null || echo "0")
    home_body_text=$(jq '.pages.home.metrics.bodyText // 0' "$screenshot_report" 2>/dev/null || echo "0")

    # Aggregate mermaid diagnostics across chapter-* pages (task 2.1)
    diag_mermaid_js_loaded=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.mermaid.jsLoaded // false] | any' "$screenshot_report" 2>/dev/null || echo "false")
    diag_mermaid_containers=$(jq '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.mermaid.containersFound // 0] | add // 0' "$screenshot_report" 2>/dev/null || echo "0")
    diag_mermaid_svgs=$(jq '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.mermaid.svgsRendered // 0] | add // 0' "$screenshot_report" 2>/dev/null || echo "0")
    diag_mermaid_render_errors=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.mermaid.renderErrors // [] | .[]] | unique | join("; ")' "$screenshot_report" 2>/dev/null || echo "")
    diag_mermaid_console_errors=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.mermaid.consoleErrors // [] | .[]] | unique | join("; ")' "$screenshot_report" 2>/dev/null || echo "")
  fi

  [[ "$total_errors" =~ ^[0-9]+$ ]] || total_errors=0
  [[ "$mermaid_rendered" =~ ^[0-9]+$ ]] || mermaid_rendered=0
  [[ "$mermaid_errors" =~ ^[0-9]+$ ]] || mermaid_errors=0
  [[ "$home_card_count" =~ ^[0-9]+$ ]] || home_card_count=0
  [[ "$home_body_text" =~ ^[0-9]+$ ]] || home_body_text=0
  [[ "$diag_mermaid_containers" =~ ^[0-9]+$ ]] || diag_mermaid_containers=0
  [[ "$diag_mermaid_svgs" =~ ^[0-9]+$ ]] || diag_mermaid_svgs=0

  # Console 无错 (10分): 每个 error 扣 2 分
  local no_errors_score=$(( 10 - total_errors * 2 ))
  (( no_errors_score < 0 )) && no_errors_score=0

  # Mermaid 渲染 (8分)
  local mermaid_score=0
  if (( mermaid_rendered > 0 && mermaid_errors == 0 )); then
    mermaid_score=8
  elif (( mermaid_rendered > 0 )); then
    mermaid_score=4
  fi

  # 布局完整 (7分): 基于布尔指标求和
  local layout_score=0
  [[ "$has_sidebar" == "true" ]] && layout_score=$((layout_score + 2))
  [[ "$has_dark_mode" == "true" ]] && layout_score=$((layout_score + 1))
  (( home_card_count > 5 )) && layout_score=$((layout_score + 2))
  (( home_body_text > 200 )) && layout_score=$((layout_score + 2))

  local visual_score=$((build_score + no_errors_score + mermaid_score + layout_score))

  # 生成 issues/suggestions — component-level with file paths (tasks 2.2, 2.6)
  local issues="[]" suggestions="[]"
  if (( build_score == 0 )); then
    issues=$(echo "$issues" | jq '. + ["网站未构建成功"]')
    suggestions=$(echo "$suggestions" | jq '. + ["检查 next build 错误日志"]')
  fi
  if (( total_errors > 0 )); then
    issues=$(echo "$issues" | jq --arg m "Console errors: $total_errors 个" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["修复 JavaScript 运行时错误"]')
  fi
  if (( mermaid_score < 8 )); then
    # Produce component-level mermaid issue with root cause diagnosis
    local mermaid_issue=""
    if [[ "$diag_mermaid_js_loaded" == "false" ]]; then
      mermaid_issue="MermaidDiagram at ${MERMAID_FILE}: ${diag_mermaid_svgs} SVGs rendered, mermaid JS not loaded — check if mermaid.initialize() is called and if the mermaid library is imported correctly"
    elif (( diag_mermaid_containers > 0 && diag_mermaid_svgs == 0 )); then
      if [ -n "$diag_mermaid_render_errors" ]; then
        mermaid_issue="MermaidDiagram at ${MERMAID_FILE}: ${diag_mermaid_containers} containers found but 0 SVGs rendered, render errors: ${diag_mermaid_render_errors} — chart syntax may be invalid or mermaid version incompatible"
      else
        mermaid_issue="MermaidDiagram at ${MERMAID_FILE}: ${diag_mermaid_containers} containers found but 0 SVGs rendered, no error text found — check if mermaid.run() or mermaid.contentLoaded() is being called after DOM mount"
      fi
    elif (( diag_mermaid_containers == 0 )); then
      mermaid_issue="MermaidDiagram at ${MERMAID_FILE}: 0 mermaid containers found in DOM — component may not be rendering .mermaid or .mermaid-container elements at all"
    else
      mermaid_issue="MermaidDiagram at ${MERMAID_FILE}: ${diag_mermaid_svgs}/${diag_mermaid_containers} SVGs rendered with ${mermaid_errors} errors"
    fi
    if [ -n "$diag_mermaid_console_errors" ]; then
      mermaid_issue="${mermaid_issue}. Console errors: ${diag_mermaid_console_errors}"
    fi
    issues=$(echo "$issues" | jq --arg m "$mermaid_issue" '. + [$m]')
    # File-path-specific suggestion
    if [[ "$diag_mermaid_js_loaded" == "false" ]]; then
      suggestions=$(echo "$suggestions" | jq --arg m "In ${MERMAID_FILE}, verify that 'import mermaid from mermaid' and mermaid.initialize() are present and executed client-side (useEffect)" '. + [$m]')
    elif (( diag_mermaid_containers > 0 && diag_mermaid_svgs == 0 )); then
      suggestions=$(echo "$suggestions" | jq --arg m "In ${MERMAID_FILE}, verify that mermaid.run() or mermaid.contentLoaded() is called after the component mounts; check mermaid chart syntax in chapter JSON data" '. + [$m]')
    else
      suggestions=$(echo "$suggestions" | jq --arg m "In ${MERMAID_FILE}, check mermaid initialization and chart syntax" '. + [$m]')
    fi
  fi
  if (( layout_score < 5 )); then
    issues=$(echo "$issues" | jq '. + ["布局指标不完整"]')
    suggestions=$(echo "$suggestions" | jq '. + ["检查 sidebar、dark mode、卡片数量"]')
  fi

  cat > "$LOG_DIR/eval_visual_iter${iteration}.json" <<EOF
{
  "dimension": "visual",
  "score": $visual_score,
  "max_score": 35,
  "breakdown": {"build": $build_score, "no_errors": $no_errors_score, "mermaid": $mermaid_score, "layout": $layout_score},
  "issues": $issues,
  "suggestions": $suggestions
}
EOF

  log OK "eval_visual: $visual_score/35 (build=$build_score err=$no_errors_score mermaid=$mermaid_score layout=$layout_score)"
}

# 交互功能评分 (25分) — 确定性公式计算
eval_interaction() {
  local iteration="$1"
  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"

  # ── Component file path map ──
  local MERMAID_FILE="web-app/components/MermaidDiagram.tsx"
  local CODEBLOCK_FILE="web-app/components/CodeBlock.tsx"
  local SEARCH_FILE="web-app/components/SearchClient.tsx"

  local search_has_input="false" search_card_count=0
  local has_sidebar="false" nav_item_count=0 home_link_count=0
  local max_code_blocks=0 pages_with_errors=0

  # Code block diagnostic aggregates (task 2.3)
  local diag_code_pre_total=0 diag_code_shiki_found="false" diag_code_highlighted=0
  # Search diagnostic data (task 2.5)
  local diag_search_input="false" diag_search_typed="false"
  local diag_search_results=0 diag_search_cards=0

  if [ -f "$screenshot_report" ]; then
    search_has_input=$(jq -r '.pages.search.metrics.hasSearchInput // false' "$screenshot_report" 2>/dev/null || echo "false")
    search_card_count=$(jq '.pages.search.metrics.cardCount // 0' "$screenshot_report" 2>/dev/null || echo "0")
    has_sidebar=$(jq -r '.pages.home.metrics.hasSidebar // false' "$screenshot_report" 2>/dev/null || echo "false")
    nav_item_count=$(jq '.pages.home.metrics.navItemCount // 0' "$screenshot_report" 2>/dev/null || echo "0")
    home_link_count=$(jq '.pages.home.metrics.linkCount // 0' "$screenshot_report" 2>/dev/null || echo "0")
    pages_with_errors=$(jq '.summary.pagesWithErrors // 0' "$screenshot_report" 2>/dev/null || echo "0")
    max_code_blocks=$(jq '[.pages[].metrics.codeBlockCount // 0] | max // 0' "$screenshot_report" 2>/dev/null || echo "0")

    # Aggregate code block diagnostics across chapter pages (task 2.3)
    diag_code_pre_total=$(jq '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.codeBlock.preTagCount // 0] | add // 0' "$screenshot_report" 2>/dev/null || echo "0")
    diag_code_shiki_found=$(jq -r '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.codeBlock.shikiClassesFound // false] | any' "$screenshot_report" 2>/dev/null || echo "false")
    diag_code_highlighted=$(jq '[.pages | to_entries[] | select(.key | startswith("chapter-")) | .value.diagnostics.codeBlock.highlightedBlockCount // 0] | add // 0' "$screenshot_report" 2>/dev/null || echo "0")

    # Extract search diagnostics (task 2.5)
    diag_search_input=$(jq -r '.pages.search.diagnostics.search.inputFound // false' "$screenshot_report" 2>/dev/null || echo "false")
    diag_search_typed=$(jq -r '.pages.search.diagnostics.search.queryTyped // false' "$screenshot_report" 2>/dev/null || echo "false")
    diag_search_results=$(jq '.pages.search.diagnostics.search.resultsAfterQuery // 0' "$screenshot_report" 2>/dev/null || echo "0")
    diag_search_cards=$(jq '.pages.search.diagnostics.search.cardCountAfterQuery // 0' "$screenshot_report" 2>/dev/null || echo "0")
  fi

  [[ "$search_card_count" =~ ^[0-9]+$ ]] || search_card_count=0
  [[ "$nav_item_count" =~ ^[0-9]+$ ]] || nav_item_count=0
  [[ "$home_link_count" =~ ^[0-9]+$ ]] || home_link_count=0
  [[ "$max_code_blocks" =~ ^[0-9]+$ ]] || max_code_blocks=0
  [[ "$pages_with_errors" =~ ^[0-9]+$ ]] || pages_with_errors=0
  [[ "$diag_code_pre_total" =~ ^[0-9]+$ ]] || diag_code_pre_total=0
  [[ "$diag_code_highlighted" =~ ^[0-9]+$ ]] || diag_code_highlighted=0
  [[ "$diag_search_results" =~ ^[0-9]+$ ]] || diag_search_results=0
  [[ "$diag_search_cards" =~ ^[0-9]+$ ]] || diag_search_cards=0

  # 搜索功能 (8分)
  local search_score=0
  [[ "$search_has_input" == "true" ]] && search_score=$((search_score + 4))
  (( search_card_count > 0 )) && search_score=$((search_score + 4))

  # 导航功能 (7分)
  local nav_score=0
  [[ "$has_sidebar" == "true" ]] && nav_score=$((nav_score + 3))
  (( nav_item_count > 10 )) && nav_score=$((nav_score + 2))
  (( home_link_count > 10 )) && nav_score=$((nav_score + 2))

  # 代码高亮 (5分)
  local code_score=0
  (( max_code_blocks > 0 )) && code_score=5

  # 页面跳转 (5分)
  local routing_score=$(( 5 - pages_with_errors ))
  (( routing_score < 0 )) && routing_score=0

  local interaction_score=$((search_score + nav_score + code_score + routing_score))

  # 生成 issues/suggestions — component-level with file paths (tasks 2.4, 2.5, 2.6)
  local issues="[]" suggestions="[]"

  # Search issues with component file path (task 2.5)
  if (( search_score < 8 )); then
    local search_issue=""
    if [[ "$diag_search_input" == "false" ]]; then
      search_issue="SearchClient at ${SEARCH_FILE}: no search input element found on the search page — component may not be rendering an <input> element"
    elif [[ "$diag_search_typed" == "true" ]] && (( diag_search_cards == 0 )); then
      search_issue="SearchClient at ${SEARCH_FILE}: search input exists but 0 results after typing query — check if search data is loaded and filtering logic works"
    elif [[ "$diag_search_typed" == "false" ]]; then
      search_issue="SearchClient at ${SEARCH_FILE}: search input found but could not type query — input may be disabled or not interactive"
    else
      search_issue="SearchClient at ${SEARCH_FILE}: input=$diag_search_input, results=$diag_search_results, cards=$diag_search_cards"
    fi
    issues=$(echo "$issues" | jq --arg m "$search_issue" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq --arg m "In ${SEARCH_FILE}, verify that chapter data is fetched/imported for search indexing and that the filter function matches against the query string" '. + [$m]')
  fi

  if (( nav_score < 5 )); then
    issues=$(echo "$issues" | jq --arg m "导航: sidebar=$has_sidebar, navItems=$nav_item_count, links=$home_link_count" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["确保 sidebar 和导航链接完整"]')
  fi

  # Code block issues with component file path (task 2.4)
  if (( code_score == 0 )); then
    local code_issue=""
    if (( diag_code_pre_total == 0 )); then
      code_issue="CodeBlock at ${CODEBLOCK_FILE}: 0 <pre> tags detected across all chapter pages — component is not rendering code blocks at all, check if the component receives code data and renders a <pre> element"
    elif [[ "$diag_code_shiki_found" == "false" ]]; then
      code_issue="CodeBlock at ${CODEBLOCK_FILE}: ${diag_code_pre_total} <pre> tags found but no shiki/highlighting classes detected (0 highlighted blocks) — code renders but syntax highlighting is not applied"
    else
      code_issue="CodeBlock at ${CODEBLOCK_FILE}: ${diag_code_pre_total} <pre> tags, ${diag_code_highlighted} highlighted, shiki=${diag_code_shiki_found}"
    fi
    issues=$(echo "$issues" | jq --arg m "$code_issue" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq --arg m "In ${CODEBLOCK_FILE}, verify that shiki/highlight.js is imported and applied to the <pre>/<code> output; check that the highlighting runs client-side" '. + [$m]')
  fi

  if (( routing_score < 5 )); then
    issues=$(echo "$issues" | jq --arg m "页面错误: $pages_with_errors 个页面有 errors" '. + [$m]')
    suggestions=$(echo "$suggestions" | jq '. + ["修复页面加载错误"]')
  fi

  cat > "$LOG_DIR/eval_interaction_iter${iteration}.json" <<EOF
{
  "dimension": "interaction",
  "score": $interaction_score,
  "max_score": 25,
  "breakdown": {"search": $search_score, "navigation": $nav_score, "code_highlight": $code_score, "page_routing": $routing_score},
  "issues": $issues,
  "suggestions": $suggestions
}
EOF

  log OK "eval_interaction: $interaction_score/25 (search=$search_score nav=$nav_score code=$code_score route=$routing_score)"
}

# 合并多维分数
merge_scores() {
  local iteration="$1"

  local content_score visual_score interaction_score
  content_score=$(jq -r '.score // 0' "$LOG_DIR/eval_content_iter${iteration}.json" 2>/dev/null || echo "0")
  visual_score=$(jq -r '.score // 0' "$LOG_DIR/eval_visual_iter${iteration}.json" 2>/dev/null || echo "0")
  interaction_score=$(jq -r '.score // 0' "$LOG_DIR/eval_interaction_iter${iteration}.json" 2>/dev/null || echo "0")

  # 确保是数字
  [[ "$content_score" =~ ^[0-9]+$ ]] || content_score=0
  [[ "$visual_score" =~ ^[0-9]+$ ]] || visual_score=0
  [[ "$interaction_score" =~ ^[0-9]+$ ]] || interaction_score=0

  local total_score=$((content_score + visual_score + interaction_score))

  # 收集所有 issues
  local content_issues visual_issues interaction_issues
  content_issues=$(jq -c '.issues // []' "$LOG_DIR/eval_content_iter${iteration}.json" 2>/dev/null || echo "[]")
  visual_issues=$(jq -c '.issues // []' "$LOG_DIR/eval_visual_iter${iteration}.json" 2>/dev/null || echo "[]")
  interaction_issues=$(jq -c '.issues // []' "$LOG_DIR/eval_interaction_iter${iteration}.json" 2>/dev/null || echo "[]")

  # 收集所有 suggestions
  local content_suggestions visual_suggestions interaction_suggestions
  content_suggestions=$(jq -c '.suggestions // []' "$LOG_DIR/eval_content_iter${iteration}.json" 2>/dev/null || echo "[]")
  visual_suggestions=$(jq -c '.suggestions // []' "$LOG_DIR/eval_visual_iter${iteration}.json" 2>/dev/null || echo "[]")
  interaction_suggestions=$(jq -c '.suggestions // []' "$LOG_DIR/eval_interaction_iter${iteration}.json" 2>/dev/null || echo "[]")

  # 生成汇总 JSON
  cat > "$LOG_DIR/eval_iter${iteration}.json" <<EOF
{
  "score": $total_score,
  "scores": {
    "content": $content_score,
    "visual": $visual_score,
    "interaction": $interaction_score
  },
  "content": {
    "score": $content_score,
    "issues": $content_issues,
    "suggestions": $content_suggestions
  },
  "visual": {
    "score": $visual_score,
    "issues": $visual_issues,
    "suggestions": $visual_suggestions
  },
  "interaction": {
    "score": $interaction_score,
    "issues": $interaction_issues,
    "suggestions": $interaction_suggestions
  }
}
EOF

  log OK "Scores: content=$content_score/40 visual=$visual_score/35 interaction=$interaction_score/25 → total=$total_score/100"
}

# 主评估入口：确定性公式计算（毫秒级完成）
step_evaluate() {
  local iteration="$1"

  log STEP "Deterministic evaluation (formula-based)..."

  eval_content "$iteration"
  eval_visual "$iteration"
  eval_interaction "$iteration"

  merge_scores "$iteration"
}

# ═══════════════════════════════════════
#  Git Checkpoint: 每轮迭代后自动提交
# ═══════════════════════════════════════
step_checkpoint() {
  # 不让 git 错误杀死主循环
  set +e
  local iteration="$1"
  local score="$2"

  # 只在 harness 目录有 git 仓库时才执行
  if ! git -C "$HARNESS_DIR" rev-parse --git-dir &>/dev/null; then
    # 没有 git 仓库，初始化一个
    log INFO "Initializing git repo for checkpoints..."
    git -C "$HARNESS_DIR" init -q
    # 配置最小必要信息
    git -C "$HARNESS_DIR" config user.name "Harness Bot"
    git -C "$HARNESS_DIR" config user.email "harness@local"
  fi

  # 检查是否有变更
  local changes
  changes=$(git -C "$HARNESS_DIR" status --porcelain knowledge/ state.json 2>/dev/null | wc -l | tr -d ' ')

  if [ "$changes" -eq 0 ]; then
    log INFO "Checkpoint: no changes to commit"
    return 0
  fi

  # 只 add knowledge/ 和 state.json（不碰 web-app、logs 等）
  git -C "$HARNESS_DIR" add knowledge/ state.json 2>/dev/null || true

  # 生成描述性 commit message
  local analyzed_count
  analyzed_count=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  local msg="checkpoint: [$PROJECT_NAME] iter #${iteration} | score ${score}/100 | ${analyzed_count} chapters"

  git -C "$HARNESS_DIR" commit -q -m "$msg" 2>/dev/null && \
    log OK "Checkpoint committed: $msg" || \
    log WARN "Checkpoint commit failed (no changes?)"
  set -e
}

# ═══════════════════════════════════════
#  状态初始化/恢复
# ═══════════════════════════════════════
init_state() {
  if [ "$RESUME" = true ] && [ -f "$STATE_FILE" ]; then
    local prev_iter
    prev_iter=$(jq '.iteration // 0' "$STATE_FILE")
    local prev_score
    prev_score=$(jq '.score // 0' "$STATE_FILE")
    log INFO "Resuming from iteration $prev_iter (score: $prev_score)"
  else
    cat > "$STATE_FILE" <<'EOF'
{
  "iteration": 0,
  "score": 0,
  "scores": {
    "total": 0,
    "content": 0,
    "visual": 0,
    "interaction": 0
  },
  "phase": "init",
  "start_time": null,
  "modules_analyzed": [],
  "errors": [],
  "history": []
}
EOF
    log INFO "Fresh start"
  fi
}

# ═══════════════════════════════════════
#  主循环
# ═══════════════════════════════════════
main() {
  echo -e "${BOLD}${CYAN}"
  cat <<BANNER
╔═══════════════════════════════════════════════════════════╗
║  源码书籍生成 Harness (v2 - 多维评估 + 自我改进)          ║
║  项目: $PROJECT_NAME
║  循环: Plan → Write → Improve → Review → Build → Test → Eval ║
╚═══════════════════════════════════════════════════════════╝
BANNER
  echo -e "${NC}"
  echo -e "  Book : ${BOOK_TITLE}"
  echo -e "  Repo : ${PROJECT_ROOT}"
  echo -e "  Max  : ${MAX_HOURS}h | Threshold: ${PASS_THRESHOLD} | Parallel: ${MAX_PARALLEL}"
  echo ""

  init_state

  START_TIME=$(date +%s)
  update_state --arg t "$(date -Iseconds)" '.start_time = $t'

  local last_eval_feedback=""

  while true; do
    local elapsed
    elapsed=$(elapsed_hours)

    # 时间检查
    local elapsed_secs
    elapsed_secs=$(( $(date +%s) - START_TIME ))
    if (( elapsed_secs > MAX_HOURS * 3600 )); then
      log HEAD "Time limit reached (${MAX_HOURS}h). Finalizing..."
      break
    fi

    local iteration
    iteration=$(jq '.iteration' "$STATE_FILE")
    iteration=$((iteration + 1))

    local current_score
    current_score=$(jq '.score // 0' "$STATE_FILE")

    log HEAD "Iteration #$iteration | Score: $current_score/100 | Time: ${elapsed}h / ${MAX_HOURS}h"

    # ── Phase 1/7: 计划 ──
    log STEP "Phase 1/7: Planning..."
    if step_plan "$iteration" "$last_eval_feedback"; then
      log OK "Plan generated"
    else
      log WARN "Plan failed, using fallback"
    fi

    # ── Phase 2/7: 并行撰写章节 ──
    log STEP "Phase 2/7: Writing Chapters..."
    step_analyze "$iteration"

    # ── Phase 3/7: 改进 Web App（条件执行）──
    local needs_improve="true"
    if [ -f "$LOG_DIR/plan_iter${iteration}.json" ]; then
      needs_improve=$(jq -r '.needs_webapp_improve // true' "$LOG_DIR/plan_iter${iteration}.json" 2>/dev/null || echo "true")
    fi
    if [ "$needs_improve" = "true" ] || [ "$needs_improve" = "null" ]; then
      log STEP "Phase 3/7: Improving Web App..."
      step_improve_webapp "$iteration" "$last_eval_feedback" || log WARN "Webapp improve failed, continuing"
    else
      log INFO "Phase 3/7: Skipping webapp improve (plan says not needed)"
    fi

    # ── Phase 4/7: 代码审查 ──
    log STEP "Phase 4/7: Code Review..."
    step_code_review "$iteration" || log WARN "Code review flagged issues"

    # ── Phase 5/7: 构建网站 ──
    log STEP "Phase 5/7: Building Site..."
    step_build_site || log WARN "Site build failed, continuing"

    # ── Phase 6/7: 视觉测试 ──
    log STEP "Phase 6/7: Visual Testing..."
    step_visual_test || true

    # ── Phase 7/7: 多维度评估 ──
    log STEP "Phase 7/7: Multi-Dimensional Evaluation..."
    if step_evaluate "$iteration"; then
      local new_score
      new_score=$(extract_score "$LOG_DIR/eval_iter${iteration}.json")

      # 提取多维度反馈给下一轮计划
      last_eval_feedback=$(jq -r '
        "总分: " + (.score|tostring) + "/100" +
        " | 内容: " + (.scores.content|tostring) + "/40" +
        " | 视觉: " + (.scores.visual|tostring) + "/35" +
        " | 交互: " + (.scores.interaction|tostring) + "/25" +
        "\n内容问题: " + ((.content.issues // []) | join("; ")) +
        "\n视觉问题: " + ((.visual.issues // []) | join("; ")) +
        "\n交互问题: " + ((.interaction.issues // []) | join("; ")) +
        "\n内容建议: " + ((.content.suggestions // []) | join("; ")) +
        "\n视觉建议: " + ((.visual.suggestions // []) | join("; ")) +
        "\n交互建议: " + ((.interaction.suggestions // []) | join("; "))
      ' "$LOG_DIR/eval_iter${iteration}.json" 2>/dev/null || echo "")

      # 提取分维度分数
      local content_score visual_score interaction_score
      content_score=$(jq -r '.scores.content // 0' "$LOG_DIR/eval_iter${iteration}.json" 2>/dev/null || echo "0")
      visual_score=$(jq -r '.scores.visual // 0' "$LOG_DIR/eval_iter${iteration}.json" 2>/dev/null || echo "0")
      interaction_score=$(jq -r '.scores.interaction // 0' "$LOG_DIR/eval_iter${iteration}.json" 2>/dev/null || echo "0")

      update_state \
        --argjson iter "$iteration" \
        --argjson score "${new_score:-0}" \
        --argjson content "${content_score:-0}" \
        --argjson visual "${visual_score:-0}" \
        --argjson interaction "${interaction_score:-0}" \
        --arg phase "evaluated" \
        '.iteration = $iter | .score = $score | .phase = $phase | .scores = {"total": $score, "content": $content, "visual": $visual, "interaction": $interaction} | .history += [{"iteration": $iter, "total": $score, "content": $content, "visual": $visual, "interaction": $interaction, "time": now | todate}]'

      log INFO "Score: ${BOLD}${new_score:-0}${NC}/100 (content:${content_score}/40 visual:${visual_score}/35 interaction:${interaction_score}/25)"

      if (( ${new_score:-0} >= PASS_THRESHOLD )); then
        log HEAD "Target reached! Score ${new_score} >= $PASS_THRESHOLD"
        break
      fi
    else
      update_state --argjson iter "$iteration" '.iteration = $iter | .phase = "eval_failed"'
      log WARN "Evaluation failed, continuing"
    fi

    # ── Checkpoint: 自动 git commit ──
    step_checkpoint "$iteration" "${new_score:-0}" || true

    log INFO "Cooling down ${COOLDOWN}s..."
    sleep "$COOLDOWN"
  done

  # ── 最终构建 ──
  log HEAD "Final build..."
  step_build_site

  # ── 报告 ──
  echo ""
  echo -e "${BOLD}${GREEN}"
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  Harness Complete!                                       ║"
  echo "╠═══════════════════════════════════════════════════════════╣"
  echo -e "║  Project  : $PROJECT_NAME"
  echo -e "║  Score    : $(jq '.score' "$STATE_FILE") / 100"
  echo -e "║  Iterations: $(jq '.iteration' "$STATE_FILE")"
  echo -e "║  Duration : $(elapsed_hours)h"
  echo -e "║  Chapters : $(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')"
  echo -e "║  Site     : $WEBAPP_DIR/out/"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
  echo "Preview: cd $WEBAPP_DIR && npx serve out"
}

main "$@"

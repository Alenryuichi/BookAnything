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

  # 读取上轮截图报告
  local visual_report=""
  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"
  if [ -f "$screenshot_report" ]; then
    visual_report=$(jq '.' "$screenshot_report" 2>/dev/null || echo "{}")
  fi

  # 获取截图文件列表（供 Claude 读取）
  local screenshot_files=""
  if [ -d "$HARNESS_DIR/output/screenshots" ]; then
    screenshot_files=$(ls "$HARNESS_DIR/output/screenshots"/*.png 2>/dev/null | head -10 | tr '\n' '\n')
  fi

  local prompt_file="$LOG_DIR/_prompt_improve_iter${iteration}.md"
  cat > "$prompt_file" <<PROMPT
你是一个 Web 前端修复专家。你需要根据视觉测试报告和评估反馈，修复 Web App 的 bug。

## ⚠️ 重要限制
- 你只能修改 ${WEBAPP_DIR}/ 下的文件
- 不要修改 knowledge/ 目录下的 JSON 数据文件
- 不要修改 run.sh 或 scripts/ 下的文件
- 不要创建新的顶级目录

## 当前项目
- 项目: ${PROJECT_NAME}
- Web App 目录: ${WEBAPP_DIR}
- 这是一个 Next.js 14 静态站点

## 上轮视觉测试报告
${visual_report}

## 上轮评估反馈
${last_eval:-无}

## 截图文件（你可以用 Read 工具查看）
${screenshot_files}

## 常见问题和修复方向
1. **搜索不工作**: 检查 search 页面的数据加载和过滤逻辑
2. **Mermaid 渲染错误**: 检查 mermaid 图表语法和渲染组件
3. **布局问题**: 检查 CSS/Tailwind 样式
4. **暗色模式**: 检查 theme toggle 逻辑
5. **导航问题**: 检查 sidebar/nav 组件链接
6. **Console errors**: 修复 JS 运行时错误

## 步骤
1. 先用 Read 读取截图（如果有的话），了解视觉问题
2. 用 Glob/Grep 定位相关组件代码
3. 用 Edit/Write 修复 bug
4. 每次修改都要确保不破坏现有功能

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

# 内容质量评分 (40分)
eval_content() {
  local iteration="$1"

  local analysis_count
  analysis_count=$(ls "$CHAPTERS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  local total_chapters
  total_chapters=$(get_total_chapters)
  local chapter_summary
  chapter_summary=$(_build_chapter_summary)

  local prompt_file="$LOG_DIR/_prompt_eval_content_iter${iteration}.md"
  cat > "$prompt_file" <<PROMPT
你是内容质量评估专家。评估《${BOOK_TITLE}》的**内容质量**。仅根据以下数据评分，不要读取文件。

## 章节状态
已写: $analysis_count / $total_chapters
$chapter_summary

## 评分维度（满分 40 分）
按以下细则打分：
- 覆盖率 (15分): $analysis_count / $total_chapters × 15，全部写完得满分
- 内容量 (15分): 章节 > 10KB 且 sections >= 4 的比例 × 15
- 叙事深度 (10分):
  - 章节 word_count >= 3000 且 sections >= 4 的比例 × 5
  - 章节有多个 section（>=5）的比例 × 5

## 输出纯 JSON
{
  "dimension": "content",
  "score": 0,
  "max_score": 40,
  "breakdown": {"coverage": 0, "volume": 0, "depth": 0},
  "issues": ["不足之处"],
  "suggestions": ["改进建议"]
}
PROMPT

  run_claude "eval_content_iter${iteration}" "$prompt_file" \
    "$LOG_DIR/eval_content_iter${iteration}.json" 8
}

# 视觉质量评分 (35分)
eval_visual() {
  local iteration="$1"

  local site_exists="false"
  [ -d "$WEBAPP_DIR/out" ] && site_exists="true"

  # 截图报告
  local visual_report=""
  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"
  if [ -f "$screenshot_report" ]; then
    visual_report=$(jq '.' "$screenshot_report" 2>/dev/null || echo "{}")
  fi

  # 截图文件列表（供读取）
  local screenshot_files=""
  if [ -d "$HARNESS_DIR/output/screenshots" ]; then
    screenshot_files=$(ls "$HARNESS_DIR/output/screenshots"/*.png 2>/dev/null | head -6 | tr '\n' '\n')
  fi

  local prompt_file="$LOG_DIR/_prompt_eval_visual_iter${iteration}.md"
  cat > "$prompt_file" <<PROMPT
你是视觉/UI 质量评估专家。评估 Web App 的**视觉质量**。

## 网站状态
构建成功: $site_exists

## 视觉测试报告
$visual_report

## 截图文件（你可以用 Read 工具查看）
$screenshot_files

## 评分维度（满分 35 分）
- 构建状态 (10分): 网站成功构建得 10 分，否则 0
- Console 无错 (10分): 0 个 console error 得 10 分，每个 error 扣 2 分，最低 0
- Mermaid 渲染 (8分): 检查截图中 Mermaid 图是否正确渲染（无错误文本、有 SVG）
- 布局完整 (7分): 页面布局正常、无断裂、响应式正确

## 步骤
1. 如果有截图文件，用 Read 工具读取截图查看
2. 结合视觉测试报告的 metrics 数据
3. 评分

## 输出纯 JSON
{
  "dimension": "visual",
  "score": 0,
  "max_score": 35,
  "breakdown": {"build": 0, "no_errors": 0, "mermaid": 0, "layout": 0},
  "issues": ["视觉问题"],
  "suggestions": ["改进建议"]
}
PROMPT

  run_claude "eval_visual_iter${iteration}" "$prompt_file" \
    "$LOG_DIR/eval_visual_iter${iteration}.json" 10 \
    "Read,Glob,Grep"
}

# 交互功能评分 (25分)
eval_interaction() {
  local iteration="$1"

  # 截图报告（含 metrics）
  local visual_report=""
  local screenshot_report="$HARNESS_DIR/output/screenshots/report.json"
  if [ -f "$screenshot_report" ]; then
    visual_report=$(jq '.' "$screenshot_report" 2>/dev/null || echo "{}")
  fi

  local prompt_file="$LOG_DIR/_prompt_eval_interaction_iter${iteration}.md"
  cat > "$prompt_file" <<PROMPT
你是交互功能评估专家。评估 Web App 的**交互功能**。仅根据以下数据评分。

## 视觉测试报告（含 metrics）
$visual_report

## 评分维度（满分 25 分）
- 搜索功能 (8分): search 页面有 input（hasSearchInput=true）得 4 分，有 card 结果得 4 分
- 导航功能 (7分): 有 sidebar/nav、链接数量合理（>10 links）、nav items 存在
- 代码高亮 (5分): 有 pre/code blocks 存在（codeBlockCount > 0）
- 页面跳转 (5分): 各页面能正常加载（无 navigation errors）

## 输出纯 JSON
{
  "dimension": "interaction",
  "score": 0,
  "max_score": 25,
  "breakdown": {"search": 0, "navigation": 0, "code_highlight": 0, "page_routing": 0},
  "issues": ["交互问题"],
  "suggestions": ["改进建议"]
}
PROMPT

  run_claude "eval_interaction_iter${iteration}" "$prompt_file" \
    "$LOG_DIR/eval_interaction_iter${iteration}.json" 8
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

# 主评估入口：并行 3 维度 + 汇总
step_evaluate() {
  local iteration="$1"

  log STEP "Starting multi-dimensional evaluation (3 parallel scorers)..."

  # 并行启动 3 个评分
  eval_content "$iteration" &
  local pid1=$!
  eval_visual "$iteration" &
  local pid2=$!
  eval_interaction "$iteration" &
  local pid3=$!

  # 等待全部完成
  local failed=0
  wait $pid1 || { log WARN "Content eval failed"; failed=$((failed + 1)); }
  wait $pid2 || { log WARN "Visual eval failed"; failed=$((failed + 1)); }
  wait $pid3 || { log WARN "Interaction eval failed"; failed=$((failed + 1)); }

  if [ $failed -eq 3 ]; then
    log ERROR "All evaluations failed"
    echo '{"score":0,"scores":{"content":0,"visual":0,"interaction":0}}' > "$LOG_DIR/eval_iter${iteration}.json"
    return 1
  fi

  # 汇总分数
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

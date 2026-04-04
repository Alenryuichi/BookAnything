## Context

Harness 是一个 Agent 系统：Plan → Write → Improve → Evaluate → 迭代。它的"正确性"不只是代码逻辑对不对，更是"Agent 能不能完成任务"。

当前 84 个测试全是代码级（Tier 1），覆盖了 eval 公式、JSON 解析、CLI 传参、state 管理。但如果有人改了 write 阶段的 prompt 模板，或者调整了 eval 的阈值条件，这些测试不会报错——因为它们不关心 Agent 行为。

## Goals / Non-Goals

**Goals:**
- 建立测试体系，让"改了 prompt → 测试报警"、"改了 eval 公式 → 校准测试验证"成为可能
- Golden run 录制/回放让代码重构有安全网——相同的 Claude 响应过新代码，分数不变
- 所有快速测试（非 E2E）在 1 秒内完成，可以每次 commit 前跑
- E2E 测试标记为 slow，只在手动触发或 CI nightly 跑

**Non-Goals:**
- 不测 Claude 模型本身的质量（那是 Anthropic 的事）
- 不做 LLM-as-judge（太慢、非确定性）
- 不替代现有 84 个代码级测试（互补，不是替代）

## Decisions

### D1: 测试目录结构

```
tests/
  agent/
    __init__.py
    test_prompt_snapshots.py    # Prompt 快照回归
    test_eval_calibration.py    # Eval 校准
    test_signal_loop.py         # 信号环完整性
    test_golden_replay.py       # Golden run 回放
    test_e2e_convergence.py     # 真实 E2E（标记 slow）
  agent_fixtures/
    golden_run/                 # 录制的 Claude 响应
      plan_response.json
      chapter_response.json
      improve_response.json
    calibration/
      good_chapter.json         # 已知高分章节
      bad_chapter.json          # 已知低分章节
      good_report.json          # 高分 report
      bad_report.json           # 低分 report
    prompts/                    # Prompt 快照
      plan_prompt.txt
      write_prompt.txt
      improve_prompt.txt
```

### D2: Golden Run 回放 — mock subprocess 返回录制的 Claude 响应

录制一次真实运行（从 `output/logs/*.raw.json` 提取 Claude 响应），存为 fixture。测试时 mock `create_subprocess_exec` 返回这些 fixture，然后跑完整管道，断言最终 state.json 的分数和预期一致。

关键价值：**重构 prompt 拼装逻辑或 JSON 清洗逻辑后，回放测试保证不引入解析 regression**。

### D3: Prompt 快照 — 不断言内容完全相同，断言关键片段

完全 snapshot 太脆（改一个变量名就挂）。改为：对每个阶段的 prompt 断言包含关键片段：
- plan prompt 必须包含 `chapters_to_write`、`improvement_focus`
- write prompt 必须包含 `70% 文字叙述`、`opening_hook`、`mermaid`
- improve prompt 必须包含 `web-app/components/`（组件路径）
- eval 不需要 prompt 快照（已经是确定性公式）

### D4: Eval 校准 — 用真实章节 JSON 做 fixture

从 `knowledge/Pydantic AI/chapters/` 中取一个高质量章节（>15KB, 5+ sections, 3000+ words）和一个低质量章节（<5KB, <3 sections），分别跑 eval，断言分数在预期范围。

同理：从 `output/screenshots/report.json` 取一个"全部功能正常"的 report 和一个"mermaid 全坏"的 report，验证 visual/interaction 评分。

### D5: 信号环完整性 — eval issues → improve prompt 的传导

给定一个固定的 report.json（含特定 diagnostics），跑 eval → 取 issues → 构建 improve prompt，断言 prompt 中包含正确的组件路径和诊断文本。这测的不是"代码能跑"，而是"信号没丢"。

### D6: E2E 收敛 — 真实 Claude 调用，标记 slow

用 `pytest.mark.slow` 标记。跑 1 轮真实循环（Plan + Write 1 章 + Build + Eval），验证：
- state.json iteration 增加
- 至少生成 1 个章节 JSON
- eval 分数 > 0
- 不崩溃

不验证分数具体值（模型不确定性），只验证管道可通。

## Risks / Trade-offs

**[Golden run fixture 过时]** → 当 Claude CLI 输出格式变化时，fixture 需要更新。缓解：fixture 中只存 `result` 字段，不依赖信封格式。

**[Prompt 快照太脆]** → 只断言关键片段（5-10 个关键词/短语），不做全文 snapshot。允许添加新内容，只检测"关键部分没丢"。

**[E2E 测试慢且费 token]** → 标记 `@pytest.mark.slow`，默认不跑。只在 `pytest -m slow` 时触发。每次约 $0.3-0.5。

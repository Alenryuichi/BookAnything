## 1. Fixtures 准备

- [x] 1.1 创建 `tests/agent_fixtures/` 目录结构（golden_run/、calibration/、prompts/）
- [x] 1.2 从 `output/logs/` 提取真实 plan 和 chapter 的 Claude 响应，存为 `golden_run/plan_response.json` 和 `golden_run/chapter_response.json`
- [x] 1.3 从 `knowledge/Pydantic AI/chapters/` 选一个高质量章节（>15KB, 5+ sections），存为 `calibration/good_chapter.json`
- [x] 1.4 手写一个低质量章节 fixture（<3KB, 2 sections, word_count=500），存为 `calibration/bad_chapter.json`
- [x] 1.5 构造一个"全功能正常"的 report.json fixture（mermaid rendered, 0 errors, sidebar present），存为 `calibration/good_report.json`
- [x] 1.6 构造一个"全部坏掉"的 report.json fixture（build fail 或 5+ errors, 0 mermaid），存为 `calibration/bad_report.json`

## 2. Eval 校准测试

- [x] 2.1 创建 `tests/agent/test_eval_calibration.py`
- [x] 2.2 测试：高质量章节 eval_content score >= 30
- [x] 2.3 测试：低质量章节 eval_content score < 20
- [x] 2.4 测试：正常 report eval_visual score >= 25
- [x] 2.5 测试：异常 report eval_visual score < 15
- [x] 2.6 测试：正常 report eval_interaction score >= 20
- [x] 2.7 测试：异常 report eval_interaction score < 10

## 3. Prompt 快照回归

- [x] 3.1 创建 `tests/agent/test_prompt_snapshots.py`
- [x] 3.2 测试 plan prompt 包含关键片段：`chapters_to_write`、`improvement_focus`、book title
- [x] 3.3 测试 write prompt 包含关键片段：`70%`、`opening_hook`、`mermaid`、`3000-5000`、chapter title
- [x] 3.4 测试 improve prompt 包含组件路径：当组件坏时包含 `MermaidDiagram.tsx`、`CodeBlock.tsx`

## 4. 信号环完整性

- [x] 4.1 创建 `tests/agent/test_signal_loop.py`
- [x] 4.2 测试：report(mermaid broken) → eval → improve diagnostic blocks 包含 MermaidDiagram 组件和 fix_hint
- [x] 4.3 测试：report(code broken) → eval → improve diagnostic blocks 包含 CodeBlock 组件
- [x] 4.4 测试：report(search broken) → eval → improve diagnostic blocks 包含 SearchClient 组件
- [x] 4.5 测试：diagnostic blocks 按分值排序（mermaid > code > search）
- [x] 4.6 测试：完整链 report → eval issues → diagnostic blocks → improve prompt 文本包含所有组件路径

## 5. Golden Run 回放

- [x] 5.1 创建 `tests/agent/test_golden_replay.py`
- [x] 5.2 测试：mock subprocess 返回 golden plan fixture，ClaudeClient.run() 解析出有效 plan
- [x] 5.3 测试：mock subprocess 返回 golden chapter fixture，解析出有效 chapter JSON
- [x] 5.4 测试：golden fixtures 解析后的 eval 分数与直接对 fixture 数据计算的分数一致

## 6. E2E 收敛（标记 slow）

- [x] 6.1 创建 `tests/agent/test_e2e_convergence.py`，所有测试标记 `@pytest.mark.slow`
- [x] 6.2 测试：用真实 Claude CLI 跑 1 轮，验证 state.json 更新且不崩溃
- [x] 6.3 在 `pyproject.toml` 中配置 `markers = ["slow: real Claude CLI tests"]`

## 7. 运行验证

- [x] 7.1 运行 `pytest tests/agent/ -v --ignore=tests/agent/test_e2e_convergence.py` 确认快速测试全过（< 1s）
- [x] 7.2 运行 `pytest tests/ -v --ignore=tests/agent/test_e2e_convergence.py` 确认全量测试通过

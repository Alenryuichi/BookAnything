---
name: harness-plan
description: Plan the next iteration of chapter writing for the harness book generation loop. Use when deciding which chapters to write or rewrite next.
allowed-tools: Read,Glob,Grep
---

# Harness 计划阶段

根据当前状态和上轮评估反馈，制定下一轮写作计划。

## 输入

- `state.json`：当前迭代数、分数、已写章节
- `goals.yaml`：质量标准和评分权重
- 已写章节列表（`knowledge/{项目名}/chapters/*.json`）
- 上轮评估反馈（如有）
- 项目配置中的章节目录（`projects/*.yaml` 的 `chapters:` 部分）

## 输出

纯 JSON 对象（不要 markdown 代码块包裹）：

```json
{
  "plan_summary": "本轮计划...",
  "chapters_to_write": [{"id": "ch01-xxx", "focus": "重点"}],
  "needs_webapp_improve": true,
  "webapp_improve_focus": "visual|interaction|both|none",
  "improvement_focus": "coverage|depth|readability|webapp"
}
```

## 规则

1. 每轮选 2-3 个未写的章节并行撰写
2. 按章节顺序优先（ch01 先于 ch02）
3. 如果章节已存在但质量不够，可以选择重写
4. 参考上轮评估反馈调整策略：
   - 内容分低 → 优先写新章节或重写薄弱章节
   - 视觉分低 → 标记 `needs_webapp_improve=true`
   - 交互分低 → 标记 `needs_webapp_improve=true`，专注交互功能修复
5. 当所有章节已写完且内容分高时，focus 应转向 webapp 改进

注意：运行时变量（iteration、上轮评估文本等）由 `run.sh` heredoc 动态注入，以 heredoc 为准。

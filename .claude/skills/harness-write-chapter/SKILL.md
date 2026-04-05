---
name: harness-write-chapter
description: Write a single book chapter as structured JSON for the harness book generation loop. Use when generating chapter content from source code analysis.
allowed-tools: Read,Glob,Grep
---

# Harness 章节写作

阅读目标项目源码，撰写一个章节的完整 JSON。

## 输入

- `chapter_id`：章节 ID（如 `ch04-tool-system`）
- `sources`：对应的源码路径（从 `projects/*.yaml` 获取）
- `outline`：章节大纲要点（从 `projects/*.yaml` 获取）
- 项目信息：名称、语言、简介、根目录

## 输出

纯 JSON 对象，符合 `.claude/rules/chapter-json-contract.md` 定义的契约。

## 写作方法论

### 渐进式结构（每节必须遵循）
1. **为什么**：先解释为什么需要这个机制
2. **直觉/比喻**：用日常比喻建立直觉
3. **图示**：用 Mermaid 图直观展示结构
4. **精确定义**：给出技术层面的精确解释
5. **代码示例**：仅贴最核心 10-20 行代码，配详解

### 比例要求
- **70% 文字叙述 + 30% 代码/图表**
- 每章 3000-5000 字
- `opening_hook` 必须用具体场景开头，200-400 字
- 正文分 4-6 个小节，每节 500-1000 字
- 至少 2 个比喻，至少 1 个 Mermaid 图
- 章末 3-5 个要点总结 + 1-2 个延伸思考

### 段落要求
- `content` 字段每段 2-4 句话，段与段之间用 `\n\n` 分隔
- 禁止 200+ 字不分段的大段文字

### 禁止
- 不要连续列出 5+ 个 type 定义
- 不要贴超过 20 行的代码块
- 不要干巴巴列清单，要有叙事和解释
- 不要执行 git 命令
- 不要使用 Write/Edit 工具写文件——JSON 输出就是最终结果

## 步骤
1. 用 Read/Glob/Grep 阅读源码
2. 理解设计意图和实现细节
3. 直接输出完整 JSON（不要用 Write 工具）

注意：运行时变量（chapter_id、sources、outline 等）由 `pyharness/` phases 动态注入。

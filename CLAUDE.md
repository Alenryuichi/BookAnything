# 源码书籍生成 Harness — 写作规范

## 项目目标
撰写一本由浅入深的技术科普书，以交互式网页形式展示目标项目的设计原理。
**不是代码参考手册，是讲故事的技术书。**

## 多项目支持
- 项目配置位于 `harness/projects/*.yaml`
- 运行时通过 `--project` 参数指定项目配置文件
- 默认使用 `projects/claude-code.yaml`
- 知识数据存储在 `knowledge/{项目名}/chapters/` 下

## 硬约束（详见 `.claude/rules/`）

以下规则由 `.claude/rules/` 定义，在 headless 和交互会话中均生效：

- **Git 安全** → `.claude/rules/git-safety.md`
- **章节 JSON 契约** → `.claude/rules/chapter-json-contract.md`
- **路径边界** → `.claude/rules/path-boundaries.md`
- **目录布局** → `.claude/rules/repo-layout.md`
- **工作流术语** → `.claude/rules/workflow-glossary.md`
- **测试约定** → `.claude/rules/testing-conventions.md`

## 写作风格

### 核心原则
- **70% 文字叙述 + 30% 代码**（不要堆砌代码！）
- 用讲故事的方式解释技术，不是罗列 API
- 每个概念都要回答「**为什么这样设计？**」
- 用比喻让复杂概念变直觉（如：Tool 系统像瑞士军刀）

### 每章必须包含
1. **开篇引子** (200-400字)：以一个问题或场景开始，引发好奇心
2. **正文分节** (每节 500-1000字)：叙述为主，穿插少量代码
3. **比喻**: 至少一个帮助理解的比喻
4. **架构图**: 至少一个 Mermaid 图（流程/架构/序列图）
5. **关键代码**: 最核心的 10-20 行代码，配详细注释和解读
6. **章末要点**: 3-5 个 bullet points 总结
7. **延伸思考**: 1-2 个引导读者深入思考的问题

### 禁止的写法
- ❌ 连续列出 5+ 个 type/interface 定义
- ❌ 贴 50+ 行代码没有解说
- ❌ 干巴巴的「该模块负责 X」一句话描述
- ❌ 用英文术语不加解释

### 好的示例
```
想象你走进一家高档餐厅。你不需要知道厨房里有几口锅、
每道菜的烹饪步骤——你只需要告诉服务员「我想吃鱼」。

这就是目标项目中工具系统的设计理念：调用者不需要了解
底层细节，只需要声明意图，系统会处理剩下的一切。

但在幕后，工具系统做了大量工作：权限检查（这个操作允许吗？）、
参数验证（输入合法吗？）、执行隔离（不同调用之间互不干扰）。
```

## 文件约定
- 章节写入: `harness/knowledge/{项目名}/chapters/{chapter-id}.json`
- 章节 JSON 格式详见 `.claude/rules/chapter-json-contract.md`

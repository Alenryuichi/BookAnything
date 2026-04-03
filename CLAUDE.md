# 源码书籍生成 Harness — 写作规范

## 项目目标
撰写一本由浅入深的技术科普书，以交互式网页形式展示目标项目的设计原理。
**不是代码参考手册，是讲故事的技术书。**

## 多项目支持
- 项目配置位于 `harness/projects/*.yaml`
- 运行时通过 `--project` 参数指定项目配置文件
- 默认使用 `projects/claude-code.yaml`
- 知识数据存储在 `knowledge/{项目名}/chapters/` 下

## ⚠️ Git 安全规则（强制）
- **禁止** `git push/reset/rebase/checkout ./clean -f/branch -D`
- **禁止** 在源码仓库中执行任何 git 写操作
- 只允许 `git status/log/diff`（只读）

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

## 数据格式

### 章节 JSON 格式
输出必须是**纯 JSON**，不要 markdown 代码块包裹。
所有文字字段都是**字符串**，不要嵌套对象。

```
{
  "chapter_id": "ch04-tool-system",
  "title": "第4章：工具系统",
  "subtitle": "核心工具的统一抽象",
  "opening_hook": "200-400字的开篇引子...",
  "sections": [
    {
      "heading": "小节标题",
      "content": "500-1000字的叙述...",
      "code": {
        "title": "代码标题",
        "description": "代码说明",
        "code": "type Tool<Input, Output, Progress> = { ... }",
        "language": "typescript",
        "annotation": "代码解读..."
      },
      "diagram": {
        "title": "流程图标题",
        "chart": "graph TD; A[请求] --> B[权限检查]; ...",
        "description": "图表说明"
      }
    }
  ],
  "key_takeaways": ["要点1", "要点2", "要点3"],
  "further_thinking": ["思考题1", "思考题2"],
  "analogies": ["比喻1"],
  "mermaid_diagrams": [...],
  "code_snippets": [...],
  "word_count": 3500,
  "prerequisites": ["ch02-startup-journey"]
}
```

## 文件约定
- 章节写入: `harness/knowledge/{项目名}/chapters/{chapter-id}.json`
- 旧模块分析保留在: `harness/knowledge/{项目名}/modules/`（向后兼容）
- JSON 必须合法可解析
- 不要在 JSON 前后添加任何文字说明

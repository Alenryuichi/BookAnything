# 章节 JSON 契约

## 输出格式

章节输出**必须是纯 JSON**，不得包含 markdown 代码块包裹（如 ```json ... ```）。
不得在 JSON 前后添加任何文字说明。

## 必需字段

每个章节 JSON 对象必须包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `chapter_id` | string | 章节标识符，如 `ch01-what-is-xxx` |
| `title` | string | 章节标题 |
| `subtitle` | string | 副标题 |
| `opening_hook` | string | 开篇引子，200-400 字 |
| `sections` | array | 小节数组，每节含 `heading` 和 `content` |
| `key_takeaways` | array of string | 3-5 个要点总结 |
| `further_thinking` | array of string | 1-2 个延伸思考 |
| `word_count` | number | 总字数，范围 3000-5000 |
| `prerequisites` | array of string | 前置章节 ID |

## sections 元素结构

每个 section 对象必须包含 `heading`（string）和 `content`（string）。
可选字段：`code`、`diagram`、`callout`、`table`。

## content 段落要求

`content` 字段中每段 2-4 句话，段与段之间用 `\n\n` 分隔。
禁止 200+ 字不分段的大段文字。

## 所有文字字段均为 string 类型

不得使用嵌套对象替代字符串字段。

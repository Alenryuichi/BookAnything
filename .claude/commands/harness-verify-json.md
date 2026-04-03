验证指定的章节 JSON 文件是否符合契约。

文件路径: $ARGUMENTS

请执行以下检查：

1. **JSON 解析**：尝试解析文件，报告语法错误（如有）
2. **必需字段检查**：验证以下字段存在且类型正确：
   - `chapter_id` (string)
   - `title` (string)
   - `subtitle` (string)
   - `opening_hook` (string, 200-400 字)
   - `sections` (array, 每个元素含 `heading` 和 `content`)
   - `key_takeaways` (array of string, 3-5 个)
   - `further_thinking` (array of string, 1-2 个)
   - `word_count` (number, 3000-5000)
   - `prerequisites` (array of string)
3. **内容质量初检**：
   - `sections` 数量是否 >= 4
   - `opening_hook` 长度是否在 200-400 字范围
   - `word_count` 是否在 3000-5000 范围
   - 是否有 `diagram` 或 `mermaid_diagrams`（至少一个 Mermaid 图）

输出：逐项检查结果 + 总体通过/失败判定。

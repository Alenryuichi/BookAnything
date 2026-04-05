## ADDED Requirements

### Requirement: Zod schema for ChapterContent
系统 MUST 在 `web-app/lib/schema.ts` 定义 Zod schema，覆盖 `ChapterContent` 类型的所有字段。Schema MUST 与现有 `types.ts` 中的 TypeScript 类型一致。

#### Scenario: Valid chapter JSON passes validation
- **WHEN** 一个包含 `chapter_id`、`title`、`subtitle`、`opening_hook`、`sections`（至少 1 个）、`key_takeaways`、`word_count` 的 JSON 对象通过 schema 校验
- **THEN** 校验 MUST 成功，返回类型安全的对象

#### Scenario: Missing required field fails validation
- **WHEN** 一个缺少 `title` 字段的 JSON 对象通过 schema 校验
- **THEN** 校验 MUST 失败，错误信息 MUST 指明缺失的字段名

### Requirement: Zod schema for BookIndex
系统 MUST 定义 `BookIndex` 的 Zod schema，用于校验 `knowledge/index.json`。

#### Scenario: Valid index passes validation
- **WHEN** `knowledge/index.json` 包含符合格式的 `books` 数组
- **THEN** schema 校验 MUST 成功

### Requirement: Section sub-schemas
`sections` 数组中每个条目 MUST 有 Zod schema 定义，包含 `heading`（必需）、`content`（必需）、`code`（可选）、`diagram`（可选）、`callout`（可选）、`table`（可选）。

#### Scenario: Section with optional fields
- **WHEN** section 包含 `heading`、`content`、`code` 但不包含 `diagram`
- **THEN** schema 校验 MUST 成功，`diagram` 字段 MUST 为 undefined

### Requirement: Schema replaces manual validation
API Routes 和 `load-knowledge.ts` 中的章节读取 MUST 使用 Zod schema 的 `safeParse` 替代现有的 `extractJson` + 手动字段检查。

#### Scenario: Malformed JSON handled gracefully
- **WHEN** `load-knowledge.ts` 读取一个包含 Markdown 包裹的 JSON 文件
- **THEN** 系统 MUST 先 strip Markdown 包裹，再用 Zod `safeParse` 校验，失败时返回 fallback 而非 crash

### Requirement: TypeScript types derived from schema
`web-app/lib/types.ts` 中的 `ChapterContent` 等类型 MUST 从 Zod schema 通过 `z.infer<>` 派生，确保类型和校验逻辑单一真源。

#### Scenario: Type and schema stay in sync
- **WHEN** 开发者修改 schema 添加新字段
- **THEN** TypeScript 类型 MUST 自动反映该字段，无需手动同步

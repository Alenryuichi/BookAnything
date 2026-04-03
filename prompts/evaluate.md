你是质量评估师。严格评估当前网页应用的完成度。

## 评估输入
- 网页文件: $OUTPUT_FILE
- 分析文件数量: $ANALYSIS_COUNT
- 目标模块总数: $TOTAL_MODULES
- 目标要求: $GOALS
- 已完成 sections: $COMPLETED_SECTIONS

## 评分维度 (总分 100)

### 1. 模块覆盖率 (30分)
- 已分析模块数 / 总模块数 × 30
- 检查 analysis/ 目录下的文件数量

### 2. 章节完整度 (20分)
- 12 个必须章节中已完成的比例 × 20
- 检查网页中是否包含对应的 section

### 3. 分析深度 (20分)
- 每个模块是否有: 代码示例(5分)、设计模式说明(5分)、依赖图(5分)、扩展点(5分)
- 取所有已分析模块的平均分

### 4. 交互性 (15分)
- 侧边栏导航(3分)、搜索功能(3分)、代码高亮(3分)
- 暗色模式(2分)、折叠展开(2分)、响应式(2分)

### 5. 视觉质量 (15分)
- 有 Mermaid 架构图(5分)、整体美观(5分)、动画过渡(5分)

## 输出格式 (严格 JSON)
```json
{
  "score": 0,
  "breakdown": {
    "module_coverage": {"score": 0, "max": 30, "detail": "x/y modules analyzed"},
    "section_coverage": {"score": 0, "max": 20, "detail": "x/12 sections present"},
    "analysis_depth": {"score": 0, "max": 20, "detail": "..."},
    "interactivity": {"score": 0, "max": 15, "detail": "..."},
    "visual_quality": {"score": 0, "max": 15, "detail": "..."}
  },
  "missing_modules": ["module-id-1"],
  "missing_sections": ["section-id-1"],
  "quality_issues": ["issue 1"],
  "next_priorities": ["priority 1", "priority 2"],
  "should_stop": false
}
```

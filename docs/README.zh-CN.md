# MarkReview 中文说明

MarkReview 是一个轻量级的 VS Code 扩展，面向批注导向的 Markdown 写作与 AI 辅助编辑。

它直接在 Markdown 文件内使用 CriticMarkup，因此用户可以保持单一源文件：在上下文中内嵌人类批注，之后 AI 代理可以在不依赖外部侧文件 JSON 的前提下处理该文件。

## 核心工作流
1. 在 VS Code 中打开一个 Markdown 文件。
2. 在编辑器中选中文本。
3. 通过 MarkReview 命令插入批注标记。
4. 保存并导出 AI 提示词。
5. 让 AI 按批注指令处理并返回更新后的 Markdown。
6. 在同一文档中保留批注，便于版本控制和后续复查。

## 核心功能
- 在 Markdown 源文件中就地添加内联批注。
- 在源代码与预览模式之间切换，无需切换文档。
- 使用与 Office Viewer 相同的 KaTeX 引擎离线渲染行内公式和块级公式。
- 在侧边栏管理批注，并可跳转到对应位置。
- 导出 AI 提示词，说明 CriticMarkup 语义与预期输出。
- 可选的清理/接受变更流程，用于原地物化修改。

## CriticMarkup 示例
- `{++新增文本++}`
- `{--删除文本--}`
- `{~~旧文本~>新文本~~}`
- `{==高亮文本==}`
- `{>>批注<<}`

## 公式示例
- 行内公式：`$E = mc^2$`
- 块级公式：

  ```latex
  $$
  \frac{a}{b}
  $$
  ```

## 文档
- [中文说明文档](./README.zh-CN.md)
- [产品需求文档](./product-requirements.md)
- [开发计划](./development-plan.md)
- [AI 工作流](./ai-workflow.md)

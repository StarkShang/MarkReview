# MarkReview Development Plan

## 开发原则

- 第一版追求小而可用，优先完成 Markdown 原文内 CriticMarkup 工作流。
- 不实现插件代码之外的复杂文档管理能力。
- 不使用外置 JSON 作为第一版批注主存储。
- 不引入 GitHub PR 工作流。
- 每个阶段都应保持插件可运行、行为可验证。

## 阶段 1：命令和文本插入

目标：完成最小可用的 CriticMarkup 写入能力。

范围：

- 注册 `MarkReview: Add Comment` 命令。
- 注册 `MarkReview: Replace Suggestion` 命令。
- 注册 `MarkReview: Delete` 命令。
- 注册 `MarkReview: Add Text` 命令。
- 仅在 Markdown 编辑器中启用或优先支持。
- 对空选区、空输入和非 Markdown 文档给出清晰反馈。

验收标准：

- 选中文本后可以插入 `{==选中文本==}{>>批注意见<<}`。
- 选中文本后可以插入 `{~~选中文本~>替换建议~~}`。
- 选中文本后可以插入 `{--选中文本--}`。
- 光标处可以插入 `{++新增内容++}`。
- 命令不会在无效输入时写入损坏的 CriticMarkup。

## 阶段 2：CriticMarkup decorations 与自定义预览可视化

目标：让带 CriticMarkup 的 Markdown 更容易阅读和审阅。

范围：

- 扫描当前 Markdown 文档中的 CriticMarkup 标记。
- 使用 VS Code editor decorations 渲染不同类型的视觉效果。
- 支持打开文档、编辑文档和切换活动编辑器时刷新。
- 保持可视化层与文本存储解耦：文档中仍保留原始 CriticMarkup。
- 提供 `MarkReview: Open Preview` 自定义预览，避免依赖不支持 CriticMarkup 的第三方 Markdown Preview。

验收标准：

- `{==内容==}` 有明显高亮。
- `{>>批注<<}` 有批注样式。
- `{--删除--}` 有删除线。
- `{++新增++}` 有新增样式。
- `{~~旧~>新~~}` 有替换建议样式。
- 大多数普通 Markdown 文档不会因为 decorations 出现明显性能问题。
- 自定义预览能把 CriticMarkup 显示为可读样式，而不是原样显示标记文本。

## 阶段 3：Clean / Accept Changes

目标：将可自动接受的 CriticMarkup 转换为干净 Markdown。

范围：

- 实现 `MarkReview: Clean / Accept Changes`。
- 自动接受新增、删除、替换三类明确标记。
- 对 `{==内容==}{>>意见<<}` 使用第一版低风险策略。
- 在执行前后保证 Markdown 文本结构尽量稳定。

建议第一版策略：

- `{++新增内容++}` 转为 `新增内容`。
- `{--删除内容--}` 删除。
- `{~~旧内容~>新内容~~}` 转为 `新内容`。
- `{==内容==}{>>意见<<}` 默认保留 `内容` 并移除批注意见，或提示用户先交给 AI 处理。

验收标准：

- 清理后文档不再包含已自动处理的 CriticMarkup 标记。
- 替换标记总是使用 `~>` 右侧的新内容。
- 批注类标记不会被插件擅自改写成未经用户确认的新正文。
- 对无法安全处理的标记给出明确提示。

## 阶段 4：Export AI Prompt

目标：降低用户把带 CriticMarkup 的 Markdown 交给 Codex 的成本。

范围：

- 实现 `MarkReview: Export AI Prompt`。
- 生成包含 CriticMarkup 规则、处理要求和输出格式要求的提示词。
- 支持复制到剪贴板，或在新编辑器中打开提示词。
- 提示词不依赖外部 JSON 批注文件。

验收标准：

- 用户可以一键得到可直接交给 Codex 的提示词。
- 提示词明确要求输出干净 Markdown。
- 提示词明确说明如何处理新增、删除、替换和批注标记。
- 提示词强调保留标题、列表、代码块、链接等 Markdown 结构。

## 阶段 5：可选探索 Comments API

目标：评估是否需要在不破坏单文件工作流的前提下增强批注体验。

探索方向：

- 将 CriticMarkup 标记解析为只读 Comments API 展示。
- 保持 CriticMarkup 仍然是主存储，不引入外置 JSON 主存储。
- 评估 Comments API 与 decorations 的体验差异。
- 验证是否能在不增加用户心智负担的前提下提供更接近原生批注的界面。

进入条件：

- 阶段 1 到阶段 4 已经稳定。
- 用户确实需要更强的批注导航或批注面板体验。
- 方案不会破坏“一个 Markdown 文件即可交给 AI”的核心产品判断。

验收标准：

- 若采用 Comments API，批注数据仍可从 Markdown 原文中的 CriticMarkup 完整恢复。
- 不要求用户维护外部批注状态文件。
- 不影响 Codex 直接处理 Markdown 文件。

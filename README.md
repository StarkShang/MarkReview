# MarkReview

MarkReview 是一个面向 Markdown 写作和 AI 协作修改的 VS Code 插件。它的目标不是做复杂的文档管理系统，而是让用户可以像在 Word 中一样快速给 Markdown 文本添加批注、替换建议、删除建议和新增建议，同时保持 Markdown 文件本身可以直接交给 Codex 或其他 AI 处理。

第一版采用 CriticMarkup 作为批注和修订的主存储格式，直接写入 Markdown 原文。这样用户只需要管理一个 `.md` 文件，不需要额外查找或同步外部批注数据。

## 核心工作流

1. 用户在 VS Code 中打开 Markdown 文件。
2. 用户选中一段文字。
3. 用户执行 MarkReview 命令添加批注或修订建议。
4. 插件直接在 Markdown 原文中插入 CriticMarkup 标记。
5. 用户把这个 Markdown 文件交给 Codex 或其他 AI。
6. AI 根据 CriticMarkup 批注直接修改正文，不新增修订标记，并保留原批注；修改差异通过 Git 查看。

## CriticMarkup 示例

MarkReview 第一版使用以下 CriticMarkup 标记：

```markdown
{++新增内容++}
{--删除内容--}
{~~旧内容~>新内容~~}
{==被标记内容==}
{>>批注意见<<}
```

常见编辑结果示例：

```markdown
这是一段{++新增说明++}。

{--这句话建议删除。--}

{~~旧表达~>更准确的新表达~~}

{==这段内容需要调整==}{>>请让语气更正式，并补充一个具体例子。<<}
```

## 第一版命令

- `MarkReview: Add Comment`：将选中文本替换为 `{==选中文本==}{>>批注意见<<}`。
- `MarkReview: Replace Suggestion`：将选中文本替换为 `{~~选中文本~>替换建议~~}`。
- `MarkReview: Delete`：将选中文本替换为 `{--选中文本--}`。
- `MarkReview: Add Text`：在光标处插入 `{++新增内容++}`。
- `MarkReview: Clean / Accept Changes`：将可自动接受的 CriticMarkup 标记转换为干净 Markdown。
- `MarkReview: Export AI Prompt`：生成一段可交给 Codex 使用的稳定提示词。
- `MarkReview: Open Preview`：打开 MarkReview 自定义 Markdown 预览，按 CriticMarkup 样式显示批注和修订。

## AI 处理提示词示例

```text
你是一个谨慎的 Markdown 修改助手。请读取下面的 Markdown 原文文件，根据其中的 CriticMarkup 批注直接修改文件内容。

原文文件地址：
E:\path\to\document.md

CriticMarkup 规则：
- {++新增内容++} 表示已有新增建议。
- {--删除内容--} 表示已有删除建议。
- {~~旧内容~>新内容~~} 表示已有替换建议。
- {==被标记内容==}{>>批注意见<<} 表示已有批注。

处理要求：
- 直接修改上述 Markdown 文件，不要另外输出一份带修改标记的版本。
- 修改正文时不要新增 CriticMarkup 标记；新增、删除、替换都直接改正文，差异由 Git 查看。
- 保留原有批注标记，尤其是 {==被标记内容==}{>>批注意见<<}；如果根据批注改写了被标记内容，只更新 {==...==} 内的正文，并保留 {>>...<<} 批注意见。
- 对已有 {++...++}、{--...--}、{~~...~>...~~} 修订建议，如决定接受，请直接改成最终正文并移除这些修订标记。
- 保持标题、列表、表格、引用、代码块、链接和图片等 Markdown 结构。
- 不要改写无关内容，除非为了局部语义连贯需要做很小调整。
- 如果批注意见不明确，采用最保守、最贴近上下文的修改。
```
更完整的 AI 协作流程见 [docs/ai-workflow.md](docs/ai-workflow.md)。

# MarkReview

MarkReview 是一个面向 Markdown 写作和 AI 协作修改的 VS Code 插件。它的目标不是做复杂的文档管理系统，而是让用户可以像在 Word 中一样快速给 Markdown 文本添加批注、替换建议、删除建议和新增建议，同时保持 Markdown 文件本身可以直接交给 Codex 或其他 AI 处理。

第一版采用 CriticMarkup 作为批注和修订的主存储格式，直接写入 Markdown 原文。这样用户只需要管理一个 `.md` 文件，不需要额外查找或同步外部批注数据。

## 核心工作流

1. 用户在 VS Code 中打开 Markdown 文件。
2. 用户选中一段文字。
3. 用户执行 MarkReview 命令添加批注或修订建议。
4. 插件直接在 Markdown 原文中插入 CriticMarkup 标记。
5. 用户把这个 Markdown 文件交给 Codex 或其他 AI。
6. AI 根据 CriticMarkup 批注修改正文，并输出不含标记的干净 Markdown。

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
你是一个 Markdown 编辑助手。请根据文档中的 CriticMarkup 标记修改正文，并输出干净 Markdown。

CriticMarkup 规则：
- {++新增内容++} 表示应保留的新增内容。
- {--删除内容--} 表示应删除的内容。
- {~~旧内容~>新内容~~} 表示用新内容替换旧内容。
- {==被标记内容==}{>>批注意见<<} 表示需要根据批注意见改写被标记内容。

处理要求：
- 输出最终干净 Markdown。
- 不要保留任何 CriticMarkup 标记。
- 保留原文结构、标题层级、列表、代码块和链接。
- 对批注意见相关内容做必要改写，不要只删除批注。
```

更完整的 AI 协作流程见 [docs/ai-workflow.md](docs/ai-workflow.md)。

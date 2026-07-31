# MarkReview

MarkReview is a lightweight VS Code extension for review-oriented Markdown writing and AI-assisted editing.

It uses CriticMarkup directly inside Markdown files, so users can keep one single source file: human review comments in context, then AI agents modify the file without needing external sidecar JSON state.

## Core Workflow
1. Open a Markdown file in VS Code.
2. Select text in the editor.
3. Add review markup via MarkReview commands.
4. Save and export an AI prompt.
5. Let AI process CriticMarkup instructions and return updated Markdown.
6. Keep the review in the same document for easy version control and follow-up edits.

## Features
- Add inline comments with CriticMarkup in-place.
- Toggle source/preview without switching documents.
- Render inline and display LaTeX formulas offline with the same KaTeX engine used by Office Viewer.
- Manage comments and jump to each one from the sidebar.
- Export an AI prompt that explains CriticMarkup semantics and expected output.
- Optional clean/accept pass to materialize changes in place.

## CriticMarkup examples
- `{++inserted text++}`
- `{--removed text--}`
- `{~~old text~>new text~~}`
- `{==highlighted text==}`
- `{>>comment<<}`

## Formula examples
- Inline formula: `$E = mc^2$`
- Display formula:

  ```latex
  $$
  \frac{a}{b}
  $$
  ```

## Documentation
- [中文说明文档](docs/README.zh-CN.md)
- [Product Requirements](docs/product-requirements.md)
- [Development Plan](docs/development-plan.md)
- [AI Workflow](docs/ai-workflow.md)

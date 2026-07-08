import * as vscode from 'vscode';

const englishMessages = {
  'command.revealReviewItem': 'Reveal Review Item',
  'confirm.deleteReviewItem.confirm': 'Delete',
  'confirm.deleteReviewItem.message': 'Delete this review item?',
  'input.addComment.placeholder': 'Explain what should be changed',
  'input.addComment.prompt': 'Enter the review comment',
  'input.addText.placeholder': 'New text',
  'input.addText.prompt': 'Enter the text to add',
  'input.replaceSuggestion.placeholder': 'Replacement text',
  'input.replaceSuggestion.prompt': 'Enter the replacement suggestion',
  'message.aiPromptCopied': 'MarkReview: AI prompt copied to clipboard.',
  'message.noCriticMarkupChanges': 'MarkReview: No CriticMarkup changes found.',
  'message.openMarkdownEditorFirst': 'MarkReview: Open a Markdown editor first.',
  'message.openMarkdownSourceFileFirst': 'MarkReview: Open a Markdown source file first.',
  'message.selectMarkdownTextFirst': 'MarkReview: Select Markdown text first.',
  'message.selectedFileNotMarkdown': 'MarkReview: The selected file is not Markdown.',
  'message.activeEditorNotMarkdown': 'MarkReview: The active editor is not Markdown.',
  'preview.addComment': 'Add Comment',
  'preview.cancel': 'Cancel',
  'preview.commentMenu': 'Comment',
  'preview.commentPlaceholder': 'Write a comment...',
  'preview.deleteReviewItem': 'Delete',
  'preview.source': 'Source',
  'preview.title': 'MarkReview Preview',
  'quickPick.selectMarkdownSourceFile': 'Select a Markdown source file',
  'review.detail.addition': 'Addition suggestion',
  'review.detail.deletion': 'Deletion suggestion',
  'review.detail.highlight': 'Marked text without a comment',
  'review.detail.standaloneComment': 'Standalone comment',
  'review.label.addition': 'Add: {0}',
  'review.label.comment': 'Comment: {0}',
  'review.label.deletion': 'Delete: {0}',
  'review.label.highlight': 'Highlight: {0}',
  'review.label.replacement': 'Replace: {0}',
  'review.line': 'Line {0}'
} as const;

const simplifiedChineseMessages: Record<MarkReviewLocalizationKey, string> = {
  'command.revealReviewItem': '定位批注项',
  'confirm.deleteReviewItem.confirm': '删除',
  'confirm.deleteReviewItem.message': '确定删除这条批注项吗？',
  'input.addComment.placeholder': '说明希望如何修改',
  'input.addComment.prompt': '输入批注意见',
  'input.addText.placeholder': '新增内容',
  'input.addText.prompt': '输入要新增的内容',
  'input.replaceSuggestion.placeholder': '替换后的文本',
  'input.replaceSuggestion.prompt': '输入替换建议',
  'message.aiPromptCopied': 'MarkReview：AI 提示词已复制到剪贴板。',
  'message.noCriticMarkupChanges': 'MarkReview：没有找到 CriticMarkup 标记。',
  'message.openMarkdownEditorFirst': 'MarkReview：请先打开一个 Markdown 编辑器。',
  'message.openMarkdownSourceFileFirst': 'MarkReview：请先打开一个 Markdown 原文文件。',
  'message.selectMarkdownTextFirst': 'MarkReview：请先选中 Markdown 文本。',
  'message.selectedFileNotMarkdown': 'MarkReview：选择的文件不是 Markdown。',
  'message.activeEditorNotMarkdown': 'MarkReview：当前编辑器不是 Markdown。',
  'preview.addComment': '添加批注',
  'preview.cancel': '取消',
  'preview.commentMenu': '批注',
  'preview.commentPlaceholder': '输入批注...',
  'preview.deleteReviewItem': '删除',
  'preview.source': '源码',
  'preview.title': 'MarkReview 预览',
  'quickPick.selectMarkdownSourceFile': '选择 Markdown 原文文件',
  'review.detail.addition': '新增建议',
  'review.detail.deletion': '删除建议',
  'review.detail.highlight': '没有批注意见的高亮文本',
  'review.detail.standaloneComment': '独立批注',
  'review.label.addition': '新增：{0}',
  'review.label.comment': '批注：{0}',
  'review.label.deletion': '删除：{0}',
  'review.label.highlight': '高亮：{0}',
  'review.label.replacement': '替换：{0}',
  'review.line': '第 {0} 行'
};

export type MarkReviewLocalizationKey = keyof typeof englishMessages;

export function localize(key: MarkReviewLocalizationKey, ...args: Array<string | number>): string {
  const messages = getActiveMessages();
  const template = messages[key] ?? englishMessages[key] ?? key;

  return template.replace(/\{(\d+)\}/g, (match, indexText) => {
    const index = Number(indexText);
    const value = args[index];

    return value === undefined ? match : String(value);
  });
}

function getActiveMessages(): Record<MarkReviewLocalizationKey, string> {
  const language = vscode.env.language.toLowerCase();

  if (language === 'zh-cn' || language.startsWith('zh')) {
    return simplifiedChineseMessages;
  }

  return englishMessages;
}
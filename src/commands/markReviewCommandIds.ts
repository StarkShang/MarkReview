export const MarkReviewCommandId = {
  AddComment: 'markReview.addComment',
  ReplaceSuggestion: 'markReview.replaceSuggestion',
  Delete: 'markReview.delete',
  AddText: 'markReview.addText',
  CleanAcceptChanges: 'markReview.cleanAcceptChanges',
  ExportAiPrompt: 'markReview.exportAiPrompt',
  OpenPreview: 'markReview.openPreview',
  OpenSource: 'markReview.openSource',
  RefreshComments: 'markReview.refreshComments',
  RevealReviewItem: 'markReview.revealReviewItem'
} as const;

export type MarkReviewCommandId =
  (typeof MarkReviewCommandId)[keyof typeof MarkReviewCommandId];
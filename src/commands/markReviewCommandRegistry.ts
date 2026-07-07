import * as vscode from 'vscode';

import { MarkReviewPreviewPanel } from '../preview/markReviewPreviewPanel';
import { MarkReviewTreeDataProvider } from '../review/markReviewTreeDataProvider';
import { MarkdownSourceTracker } from '../vscode/markdownSourceTracker';
import { MarkReviewCommandHandlers } from './markReviewCommandHandlers';
import { MarkReviewCommandId } from './markReviewCommandIds';

export function registerMarkReviewCommands(
  sourceTracker: MarkdownSourceTracker,
  treeDataProvider: MarkReviewTreeDataProvider,
  previewPanel: MarkReviewPreviewPanel
): vscode.Disposable {
  const handlers = new MarkReviewCommandHandlers(sourceTracker);

  return vscode.Disposable.from(
    vscode.commands.registerCommand(MarkReviewCommandId.AddComment, () =>
      handlers.addComment()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.ReplaceSuggestion, () =>
      handlers.replaceSuggestion()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.Delete, () =>
      handlers.delete()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.AddText, () =>
      handlers.addText()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.CleanAcceptChanges, () =>
      handlers.cleanAcceptChanges()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.ExportAiPrompt, () =>
      handlers.exportAiPrompt()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.OpenPreview, () =>
      previewPanel.openPreview()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.OpenSource, () =>
      previewPanel.openSource()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.TogglePreview, () =>
      previewPanel.togglePreview()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.RefreshComments, () =>
      treeDataProvider.refresh()
    ),
    vscode.commands.registerCommand(MarkReviewCommandId.RevealReviewItem, (target) =>
      previewPanel.revealReviewItem(target)
    )
  );
}
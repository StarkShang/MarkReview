import * as vscode from 'vscode';

import { registerMarkReviewCommands } from './commands/markReviewCommandRegistry';
import { CriticMarkupDecorationController } from './decorations/criticMarkupDecorationController';
import { MarkReviewPreviewPanel } from './preview/markReviewPreviewPanel';
import { MarkReviewTreeDataProvider } from './review/markReviewTreeDataProvider';
import { MarkdownSourceTracker } from './vscode/markdownSourceTracker';

export function activate(context: vscode.ExtensionContext): void {
  const sourceTracker = new MarkdownSourceTracker();
  const decorationController = new CriticMarkupDecorationController();
  const treeDataProvider = new MarkReviewTreeDataProvider(sourceTracker);
  const previewPanel = new MarkReviewPreviewPanel(sourceTracker);
  const treeView = vscode.window.createTreeView('markReview.comments', {
    treeDataProvider
  });

  context.subscriptions.push(
    sourceTracker,
    sourceTracker.start(),
    decorationController,
    decorationController.start(),
    treeDataProvider,
    treeDataProvider.start(),
    previewPanel,
    previewPanel.start(),
    treeView,
    registerMarkReviewCommands(sourceTracker, treeDataProvider, previewPanel)
  );
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}
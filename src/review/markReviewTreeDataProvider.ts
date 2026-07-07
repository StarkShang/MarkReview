import * as vscode from 'vscode';

import { MarkReviewCommandId } from '../commands/markReviewCommandIds';
import { localize } from '../i18n/markReviewLocalization';
import {
  CriticMarkupReviewItem,
  parseCriticMarkupReviewItems
} from '../core/criticMarkupReviewItem';
import { MarkdownSourceTracker } from '../vscode/markdownSourceTracker';
import { MarkReviewRevealTarget } from './markReviewRevealTarget';

export class MarkReviewTreeDataProvider
implements vscode.TreeDataProvider<MarkReviewTreeItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<MarkReviewTreeItem | undefined>();
  private isRefreshQueued = false;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly sourceTracker: MarkdownSourceTracker) {}

  public start(): vscode.Disposable {
    return vscode.Disposable.from(
      this.sourceTracker.onDidChangeMarkdownSource(() => {
        this.refresh();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'markdown') {
          this.refresh();
        }
      })
    );
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  public refresh(): void {
    if (this.isRefreshQueued) {
      return;
    }

    this.isRefreshQueued = true;
    void Promise.resolve().then(() => {
      this.isRefreshQueued = false;
      this.changeEmitter.fire(undefined);
    });
  }

  public getTreeItem(element: MarkReviewTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<MarkReviewTreeItem[]> {
    const document = this.sourceTracker.getActiveMarkdownDocument();
    if (!document) {
      return [];
    }

    return parseCriticMarkupReviewItems(document.getText()).map((reviewItem) =>
      new MarkReviewTreeItem(document, reviewItem)
    );
  }
}

export class MarkReviewTreeItem
extends vscode.TreeItem
implements MarkReviewRevealTarget {
  public readonly uri: vscode.Uri;
  public readonly startOffset: number;
  public readonly endOffset: number;

  public constructor(
    document: vscode.TextDocument,
    reviewItem: CriticMarkupReviewItem
  ) {
    super(getReviewItemLabel(reviewItem), vscode.TreeItemCollapsibleState.None);

    const startPosition = document.positionAt(reviewItem.startOffset);

    this.id = `${document.uri.toString()}:${reviewItem.id}`;
    this.uri = document.uri;
    this.startOffset = reviewItem.startOffset;
    this.endOffset = reviewItem.endOffset;
    this.description = localize('review.line', startPosition.line + 1);
    this.tooltip = getReviewItemDetail(reviewItem);
    this.contextValue = 'markReviewReviewItem';
    this.iconPath = getReviewItemIcon(reviewItem.kind);
    this.command = {
      command: MarkReviewCommandId.RevealReviewItem,
      title: localize('command.revealReviewItem'),
      arguments: [this]
    };
  }
}

function getReviewItemLabel(reviewItem: CriticMarkupReviewItem): string {
  switch (reviewItem.kind) {
    case 'Addition':
      return localize('review.label.addition', reviewItem.label);
    case 'Comment':
    case 'StandaloneComment':
      return localize('review.label.comment', reviewItem.label);
    case 'Deletion':
      return localize('review.label.deletion', reviewItem.label);
    case 'Highlight':
      return localize('review.label.highlight', reviewItem.label);
    case 'Replacement':
      return localize('review.label.replacement', reviewItem.label);
  }
}

function getReviewItemDetail(reviewItem: CriticMarkupReviewItem): string {
  switch (reviewItem.kind) {
    case 'Addition':
      return localize('review.detail.addition');
    case 'Deletion':
      return localize('review.detail.deletion');
    case 'Highlight':
      return localize('review.detail.highlight');
    case 'StandaloneComment':
      return localize('review.detail.standaloneComment');
    case 'Comment':
    case 'Replacement':
      return reviewItem.detail;
  }
}
function getReviewItemIcon(kind: CriticMarkupReviewItem['kind']): vscode.ThemeIcon {
  switch (kind) {
    case 'Addition':
      return new vscode.ThemeIcon('add');
    case 'Comment':
    case 'StandaloneComment':
      return new vscode.ThemeIcon('comment');
    case 'Deletion':
      return new vscode.ThemeIcon('trash');
    case 'Highlight':
      return new vscode.ThemeIcon('symbol-color');
    case 'Replacement':
      return new vscode.ThemeIcon('replace');
  }
}

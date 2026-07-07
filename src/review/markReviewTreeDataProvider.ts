import * as vscode from 'vscode';

import { MarkReviewCommandId } from '../commands/markReviewCommandIds';
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
    const document = await this.sourceTracker.getTrackedMarkdownDocument();
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
    super(reviewItem.label, vscode.TreeItemCollapsibleState.None);

    const startPosition = document.positionAt(reviewItem.startOffset);

    this.id = `${document.uri.toString()}:${reviewItem.id}`;
    this.uri = document.uri;
    this.startOffset = reviewItem.startOffset;
    this.endOffset = reviewItem.endOffset;
    this.description = `Line ${startPosition.line + 1}`;
    this.tooltip = reviewItem.detail;
    this.contextValue = 'markReviewReviewItem';
    this.iconPath = getReviewItemIcon(reviewItem.kind);
    this.command = {
      command: MarkReviewCommandId.RevealReviewItem,
      title: 'Reveal Review Item',
      arguments: [this]
    };
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
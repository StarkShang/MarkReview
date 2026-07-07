import * as vscode from 'vscode';

export interface MarkReviewRevealTarget {
  readonly uri: vscode.Uri;
  readonly startOffset: number;
  readonly endOffset: number;
}
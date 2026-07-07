import * as vscode from 'vscode';

import { MarkReviewCommandId } from '../commands/markReviewCommandIds';
import { renderMarkdownPreviewContent } from '../core/markdownPreviewRenderer';
import { MarkdownSourceTracker } from '../vscode/markdownSourceTracker';

export class MarkReviewPreviewPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private document: vscode.TextDocument | undefined;

  public constructor(private readonly sourceTracker: MarkdownSourceTracker) {}

  public start(): vscode.Disposable {
    return vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.document && event.document.uri.toString() === this.document.uri.toString()) {
          this.document = event.document;
          this.update();
        }
      }),
      this.sourceTracker.onDidChangeMarkdownSource(async () => {
        if (!this.panel) {
          return;
        }

        const document = await this.sourceTracker.getTrackedMarkdownDocument();
        if (document) {
          this.document = document;
          this.update();
        }
      })
    );
  }

  public dispose(): void {
    this.panel?.dispose();
  }

  public async openPreview(): Promise<void> {
    const document = await this.getPreviewDocument();
    if (!document) {
      return;
    }

    this.document = document;
    this.sourceTracker.rememberDocument(document);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'markReview.preview',
        'MarkReview Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      });
    }

    this.panel.reveal(vscode.ViewColumn.Beside);
    this.update();
  }

  private async getPreviewDocument(): Promise<vscode.TextDocument | undefined> {
    const document = await this.sourceTracker.getTrackedMarkdownDocument();
    if (document) {
      return document;
    }

    const editor = await this.sourceTracker.openMarkdownSource();
    return editor?.document;
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (!this.document) {
      return;
    }

    if (message.type === 'reveal') {
      await vscode.commands.executeCommand(MarkReviewCommandId.RevealReviewItem, {
        uri: this.document.uri,
        startOffset: message.startOffset,
        endOffset: message.endOffset
      });
      return;
    }

    if (message.type === 'openSource') {
      await vscode.commands.executeCommand(MarkReviewCommandId.OpenSource);
    }
  }

  private update(): void {
    if (!this.panel || !this.document) {
      return;
    }

    this.panel.title = `MarkReview Preview: ${vscode.workspace.asRelativePath(this.document.uri)}`;
    this.panel.webview.html = this.createHtml(this.panel.webview, this.document);
  }

  private createHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    const nonce = createNonce();
    const content = renderMarkdownPreviewContent(document.getText());
    const title = escapeHtml(vscode.workspace.asRelativePath(document.uri));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarkReview Preview</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.72;
    }

    .mr-shell {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 44px 56px;
    }

    .mr-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: -28px -44px 28px;
      padding: 10px 44px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editor-background);
    }

    .mr-title {
      min-width: 0;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mr-toolbar-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;
    }

    .mr-toolbar-button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 4px 8px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .mr-toolbar-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    h1, h2, h3, h4, h5, h6 {
      margin: 1.4em 0 0.55em;
      line-height: 1.25;
      color: var(--vscode-editor-foreground);
    }

    h1 {
      padding-bottom: 0.25em;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      font-size: 2em;
    }

    h2 {
      padding-bottom: 0.2em;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      font-size: 1.55em;
    }

    p, ul, ol, blockquote, table, pre {
      margin: 0 0 1em;
    }

    ul, ol {
      padding-left: 1.75em;
    }

    blockquote {
      padding: 0.7em 1em;
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      color: var(--vscode-textBlockQuote-foreground);
      background: var(--vscode-textBlockQuote-background);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 6px 10px;
      border: 1px solid var(--vscode-editorWidget-border);
      vertical-align: top;
    }

    th {
      background: var(--vscode-editor-lineHighlightBackground);
      text-align: left;
    }

    code {
      border-radius: 3px;
      padding: 0.08em 0.28em;
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family);
    }

    pre {
      overflow: auto;
      border-radius: 6px;
      padding: 14px 16px;
      background: var(--vscode-textCodeBlock-background);
    }

    pre code {
      padding: 0;
      background: transparent;
    }

    a {
      color: var(--vscode-textLink-foreground);
    }

    .mr-mark {
      cursor: pointer;
      border-radius: 3px;
      padding: 0.05em 0.18em;
    }

    .mr-mark:hover,
    .mr-mark.mr-active {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .mr-addition {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: rgba(46, 160, 67, 0.18);
      text-decoration: none;
    }

    .mr-deletion {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      background: rgba(248, 81, 73, 0.16);
      text-decoration: line-through;
    }

    .mr-highlight,
    .mr-highlighted-text {
      background: rgba(255, 213, 77, 0.32);
    }

    .mr-commented {
      background: rgba(255, 213, 77, 0.18);
    }

    .mr-comment-badge,
    .mr-standalone-comment {
      margin-left: 0.35em;
      border: 1px solid rgba(88, 166, 255, 0.5);
      border-radius: 4px;
      padding: 0.08em 0.38em;
      color: var(--vscode-textLink-foreground);
      background: rgba(88, 166, 255, 0.14);
      font-size: 0.9em;
      font-style: italic;
    }

    .mr-replacement {
      background: rgba(163, 113, 247, 0.16);
    }

    .mr-replacement-old {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      text-decoration: line-through;
    }

    .mr-replacement-arrow {
      margin: 0 0.35em;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }

    .mr-replacement-new {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="mr-shell">
    <header class="mr-toolbar">
      <div class="mr-title">${title}</div>
      <div class="mr-toolbar-actions">
        <button class="mr-toolbar-button" type="button" data-command="openSource">Source</button>
      </div>
    </header>
    <article class="mr-document">${content}</article>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-markreview-start]')
        : null;

      if (target) {
        document.querySelectorAll('.mr-active').forEach((element) => {
          element.classList.remove('mr-active');
        });
        target.classList.add('mr-active');
        vscode.postMessage({
          type: 'reveal',
          startOffset: Number(target.dataset.markreviewStart),
          endOffset: Number(target.dataset.markreviewEnd)
        });
        return;
      }

      const commandTarget = event.target instanceof Element
        ? event.target.closest('[data-command]')
        : null;

      if (commandTarget?.dataset.command === 'openSource') {
        vscode.postMessage({ type: 'openSource' });
      }
    });
  </script>
</body>
</html>`;
  }
}

interface WebviewMessage {
  readonly type: 'reveal' | 'openSource';
  readonly startOffset?: number;
  readonly endOffset?: number;
}

function createNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return nonce;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
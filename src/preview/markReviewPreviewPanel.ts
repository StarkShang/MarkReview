import * as vscode from 'vscode';

import { MarkReviewCommandId } from '../commands/markReviewCommandIds';
import { markCommentedText } from '../core/criticMarkup';
import { renderMarkdownPreviewContent } from '../core/markdownPreviewRenderer';
import { localize } from '../i18n/markReviewLocalization';
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

  public async togglePreview(): Promise<void> {
    if (this.panel?.active) {
      await this.sourceTracker.openMarkdownSource();
      return;
    }

    await this.openPreview();
  }

  public async openPreview(): Promise<void> {
    const viewColumn = this.getPreviewViewColumn();
    const document = await this.getPreviewDocument();
    if (!document) {
      return;
    }

    this.document = document;
    this.sourceTracker.rememberDocument(document);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'markReview.preview',
        localize('preview.title'),
        viewColumn,
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

    this.panel.reveal(viewColumn);
    this.update();
  }

  private getPreviewViewColumn(): vscode.ViewColumn {
    const editor = this.sourceTracker.getActiveOrVisibleMarkdownEditor();

    return editor?.viewColumn ?? this.panel?.viewColumn ?? vscode.ViewColumn.Active;
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
      return;
    }

    if (message.type === 'addComment') {
      await this.addCommentFromPreview(message);
    }
  }

  private async addCommentFromPreview(message: WebviewMessage): Promise<void> {
    if (!this.document || message.startOffset === undefined || message.endOffset === undefined) {
      return;
    }

    const comment = message.comment?.trim();
    if (!comment) {
      return;
    }

    const startOffset = Math.min(message.startOffset, message.endOffset);
    const endOffset = Math.max(message.startOffset, message.endOffset);
    if (startOffset === endOffset) {
      return;
    }

    const range = new vscode.Range(
      this.document.positionAt(startOffset),
      this.document.positionAt(endOffset)
    );
    const selectedText = this.document.getText(range);
    if (selectedText.trim().length === 0) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, range, markCommentedText(selectedText, comment));
    await vscode.workspace.applyEdit(edit);
  }

  private update(): void {
    if (!this.panel || !this.document) {
      return;
    }

    this.panel.title = `${localize('preview.title')}: ${vscode.workspace.asRelativePath(this.document.uri)}`;
    this.panel.webview.html = this.createHtml(this.panel.webview, this.document);
  }

  private createHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    const nonce = createNonce();
    const content = renderMarkdownPreviewContent(document.getText());
    const title = escapeHtml(vscode.workspace.asRelativePath(document.uri));
    const addCommentLabel = escapeHtml(localize('preview.addComment'));
    const cancelLabel = escapeHtml(localize('preview.cancel'));
    const commentMenuLabel = escapeHtml(localize('preview.commentMenu'));
    const commentPlaceholder = escapeHtml(localize('preview.commentPlaceholder'));
    const previewTitle = escapeHtml(localize('preview.title'));
    const sourceLabel = escapeHtml(localize('preview.source'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${previewTitle}</title>
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

    .mr-context-menu {
      position: fixed;
      z-index: 30;
      display: none;
      min-width: 150px;
      border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border));
      border-radius: 4px;
      padding: 4px;
      background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }

    .mr-context-menu.is-open {
      display: block;
    }

    .mr-context-menu button {
      width: 100%;
      border: 0;
      border-radius: 3px;
      padding: 6px 8px;
      color: var(--vscode-menu-foreground, var(--vscode-editor-foreground));
      background: transparent;
      font: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }

    .mr-context-menu button:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-editor-foreground));
    }

    .mr-comment-composer {
      position: fixed;
      z-index: 31;
      display: none;
      width: min(340px, calc(100vw - 28px));
      border: 1px solid var(--vscode-inputOption-activeBorder, var(--vscode-focusBorder));
      border-radius: 6px;
      padding: 10px;
      background: var(--vscode-editorWidget-background);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
    }

    .mr-comment-composer.is-open {
      display: block;
    }

    .mr-comment-composer textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 84px;
      resize: vertical;
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 4px;
      padding: 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font: inherit;
      line-height: 1.45;
    }

    .mr-comment-composer textarea:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.95);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.24);
    }

    .mr-comment-composer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .mr-comment-composer button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 4px 10px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .mr-comment-submit {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    .mr-comment-cancel {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
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
    .mr-commented {
      background: rgba(255, 213, 77, 0.32);
      box-shadow: inset 0 -2px 0 rgba(255, 193, 7, 0.65);
    }

    .mr-hidden-comment {
      display: none;
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
  <div class="mr-context-menu" data-role="context-menu">
    <button type="button" data-command="addComment">${commentMenuLabel}</button>
  </div>
  <div class="mr-comment-composer" data-role="comment-composer">
    <textarea data-role="comment-input" placeholder="${commentPlaceholder}"></textarea>
    <div class="mr-comment-composer-actions">
      <button class="mr-comment-cancel" type="button" data-command="cancelComment">${cancelLabel}</button>
      <button class="mr-comment-submit" type="button" data-command="submitComment">${addCommentLabel}</button>
    </div>
  </div>
  <main class="mr-shell">
    <header class="mr-toolbar">
      <div class="mr-title">${title}</div>
      <div class="mr-toolbar-actions">
        <button class="mr-toolbar-button" type="button" data-command="openSource">${sourceLabel}</button>
      </div>
    </header>
    <article class="mr-document">${content}</article>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const contextMenu = document.querySelector('[data-role="context-menu"]');
    const commentComposer = document.querySelector('[data-role="comment-composer"]');
    const commentInput = document.querySelector('[data-role="comment-input"]');
    let pendingSelection = undefined;
    let pendingPoint = { x: 0, y: 0 };

    document.addEventListener('contextmenu', (event) => {
      const selectionRange = getSelectedSourceRange();
      if (!selectionRange) {
        hideContextMenu();
        return;
      }

      event.preventDefault();
      pendingSelection = selectionRange;
      pendingPoint = { x: event.clientX, y: event.clientY };
      showContextMenu(event.clientX, event.clientY);
    });

    document.addEventListener('click', (event) => {
      const commandTarget = event.target instanceof Element
        ? event.target.closest('[data-command]')
        : null;

      if (commandTarget?.dataset.command === 'addComment') {
        hideContextMenu();
        showCommentComposer(pendingPoint.x, pendingPoint.y);
        return;
      }

      if (commandTarget?.dataset.command === 'cancelComment') {
        hideCommentComposer();
        return;
      }

      if (commandTarget?.dataset.command === 'submitComment') {
        submitComment();
        return;
      }

      if (commandTarget?.dataset.command === 'openSource') {
        vscode.postMessage({ type: 'openSource' });
        return;
      }

      if (event.target instanceof Element && event.target.closest('[data-role="context-menu"], [data-role="comment-composer"]')) {
        return;
      }

      hideContextMenu();

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
      }
    });

    commentInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        submitComment();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        hideCommentComposer();
      }
    });

    function submitComment() {
      const comment = commentInput.value.trim();
      if (!pendingSelection || comment.length === 0) {
        commentInput.focus();
        return;
      }

      vscode.postMessage({
        type: 'addComment',
        startOffset: pendingSelection.startOffset,
        endOffset: pendingSelection.endOffset,
        comment
      });
      hideCommentComposer();
      window.getSelection()?.removeAllRanges();
    }

    function getSelectedSourceRange() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || selection.toString().trim().length === 0) {
        return undefined;
      }

      const anchorOffset = getSourceOffset(selection.anchorNode, selection.anchorOffset);
      const focusOffset = getSourceOffset(selection.focusNode, selection.focusOffset);
      if (anchorOffset === undefined || focusOffset === undefined || anchorOffset === focusOffset) {
        return undefined;
      }

      return {
        startOffset: Math.min(anchorOffset, focusOffset),
        endOffset: Math.max(anchorOffset, focusOffset)
      };
    }

    function getSourceOffset(node, offset) {
      if (!node) {
        return undefined;
      }

      const element = node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement;
      const sourceSpan = element?.closest('[data-markreview-text-start]');
      if (!sourceSpan) {
        return undefined;
      }

      const sourceStart = Number(sourceSpan.dataset.markreviewTextStart);
      if (!Number.isFinite(sourceStart)) {
        return undefined;
      }

      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(sourceSpan);
      try {
        prefixRange.setEnd(node, offset);
      } catch {
        return undefined;
      }

      return sourceStart + prefixRange.toString().length;
    }

    function showContextMenu(x, y) {
      positionFloatingElement(contextMenu, x, y);
      contextMenu.classList.add('is-open');
      hideCommentComposer();
    }

    function hideContextMenu() {
      contextMenu.classList.remove('is-open');
    }

    function showCommentComposer(x, y) {
      if (!pendingSelection) {
        return;
      }

      commentInput.value = '';
      positionFloatingElement(commentComposer, x, y);
      commentComposer.classList.add('is-open');
      requestAnimationFrame(() => commentInput.focus());
    }

    function hideCommentComposer() {
      commentComposer.classList.remove('is-open');
      commentInput.value = '';
    }

    function positionFloatingElement(element, x, y) {
      element.style.left = '0px';
      element.style.top = '0px';
      element.classList.add('is-open');
      const rect = element.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - rect.width - 12);
      const top = Math.min(y, window.innerHeight - rect.height - 12);
      element.style.left = Math.max(12, left) + 'px';
      element.style.top = Math.max(12, top) + 'px';
    }
  </script>
</body>
</html>`;
  }
}

interface WebviewMessage {
  readonly type: 'reveal' | 'openSource' | 'addComment';
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly comment?: string;
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
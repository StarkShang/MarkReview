import * as vscode from 'vscode';

import { removeCriticMarkupReviewItem } from '../core/cleanMarkdown';
import { markCommentedText } from '../core/criticMarkup';
import { renderMarkdownPreviewContent } from '../core/markdownPreviewRenderer';
import { localize } from '../i18n/markReviewLocalization';
import { MarkReviewRevealTarget } from '../review/markReviewRevealTarget';
import { MarkdownSourceTracker } from '../vscode/markdownSourceTracker';

export class MarkReviewPreviewPanel implements vscode.Disposable {
  private readonly previewStates = new Map<string, MarkReviewPreviewState>();

  public constructor(private readonly sourceTracker: MarkdownSourceTracker) {}

  public start(): vscode.Disposable {
    void Promise.resolve().then(() => {
      this.openPreviewForActiveMarkdownSource();
    });

    return vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'markdown') {
          return;
        }

        const previewState = this.previewStates.get(getPreviewStateKey(event.document.uri));
        if (!previewState) {
          return;
        }

        previewState.document = event.document;
        this.updatePreviewState(previewState);
      }),
      this.sourceTracker.onDidChangeMarkdownSource(() => {
        if (this.previewStates.size > 0) {
          return;
        }

        this.openPreviewForActiveMarkdownSource();
      })
    );
  }

  public dispose(): void {
    for (const previewState of this.previewStates.values()) {
      previewState.panel.dispose();
    }

    this.previewStates.clear();
  }

  public async togglePreview(): Promise<void> {
    const activePreviewState = this.getActivePreviewState();
    if (activePreviewState) {
      await this.revealSourceDocument(activePreviewState.document, undefined, {
        viewColumn: activePreviewState.panel.viewColumn ?? vscode.ViewColumn.Beside
      });
      return;
    }

    await this.openPreview();
  }

  public async openPreview(): Promise<void> {
    const document = await this.getPreviewDocument();
    if (!document) {
      return;
    }

    await this.revealSourceDocument(document, undefined, {
      preserveFocus: true,
      viewColumn: this.getSourceViewColumn(document)
    });

    this.openPreviewDocument(document, {
      viewColumn: vscode.ViewColumn.Beside
    });
  }

  public async openSource(): Promise<void> {
    const activePreviewState = this.getActivePreviewState();
    if (activePreviewState) {
      await this.revealSourceDocument(activePreviewState.document, undefined, {
        viewColumn: activePreviewState.panel.viewColumn ?? vscode.ViewColumn.Beside
      });
      return;
    }

    const document = this.sourceTracker.getActiveMarkdownDocument();
    if (document) {
      await this.revealSourceDocument(document);
      return;
    }

    await this.sourceTracker.openMarkdownSource({ allowFallbackToTrackedSource: true });
  }

  public async revealReviewItem(target: MarkReviewRevealTarget | undefined): Promise<void> {
    if (!target) {
      await this.openPreview();
      return;
    }

    const document = await vscode.workspace.openTextDocument(target.uri);
    if (document.languageId !== 'markdown') {
      return;
    }

    const range = getSourceRange(document, target);
    const didRevealSource = this.revealVisibleSourceEditors(document, range);
    const previewState = this.previewStates.get(getPreviewStateKey(document.uri));
    const didRevealPreview = this.revealVisiblePreview(previewState, target);

    if (didRevealSource || didRevealPreview) {
      this.sourceTracker.rememberDocument(document);
      return;
    }

    await this.revealSourceDocument(document, range, {
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Active
    });
    this.openPreviewDocument(document, {
      revealTarget: target,
      viewColumn: vscode.ViewColumn.Beside
    });
  }

  private getActivePreviewState(): MarkReviewPreviewState | undefined {
    return Array.from(this.previewStates.values()).find((previewState) =>
      previewState.panel.active
    );
  }

  private getSourceViewColumn(document: vscode.TextDocument): vscode.ViewColumn {
    const activeEditor = this.sourceTracker.getActiveMarkdownEditor();
    if (activeEditor?.document.uri.toString() === document.uri.toString()) {
      return activeEditor.viewColumn ?? vscode.ViewColumn.Active;
    }

    const visibleEditor = this.findVisibleSourceEditors(document)[0];
    return visibleEditor?.viewColumn ?? vscode.ViewColumn.Active;
  }

  private openPreviewForActiveMarkdownSource(): void {
    const editor = this.sourceTracker.getActiveMarkdownEditor();
    if (!editor) {
      return;
    }

    this.openPreviewDocument(editor.document, {
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside
    });
  }

  private async getPreviewDocument(): Promise<vscode.TextDocument | undefined> {
    const document = this.sourceTracker.getActiveMarkdownDocument();
    if (document) {
      return document;
    }

    const editor = await this.sourceTracker.openMarkdownSource({ allowFallbackToTrackedSource: true });
    return editor?.document;
  }

  private openPreviewDocument(
    document: vscode.TextDocument,
    options: OpenPreviewDocumentOptions = {}
  ): void {
    const previewStateKey = getPreviewStateKey(document.uri);
    let previewState = this.previewStates.get(previewStateKey);
    const viewColumn = options.viewColumn ?? vscode.ViewColumn.Beside;

    this.sourceTracker.rememberDocument(document);

    if (!previewState) {
      previewState = this.createPreviewState(previewStateKey, document, viewColumn, options);
      this.previewStates.set(previewStateKey, previewState);
    } else {
      previewState.document = document;
      previewState.panel.reveal(viewColumn, options.preserveFocus);
    }

    previewState.revealTarget = options.revealTarget;
    this.updatePreviewState(previewState);
  }

  private createPreviewState(
    key: string,
    document: vscode.TextDocument,
    viewColumn: vscode.ViewColumn,
    options: OpenPreviewDocumentOptions
  ): MarkReviewPreviewState {
    const panel = vscode.window.createWebviewPanel(
      'markReview.preview',
      localize('preview.title'),
      {
        preserveFocus: options.preserveFocus,
        viewColumn
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const previewState: MarkReviewPreviewState = {
      document,
      key,
      panel
    };

    panel.onDidDispose(() => {
      this.previewStates.delete(key);
    });

    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activatePreviewSource(previewState);
      }
    });

    panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(previewState, message);
    });

    return previewState;
  }

  private async handleMessage(
    previewState: MarkReviewPreviewState,
    message: WebviewMessage
  ): Promise<void> {
    if (message.type === 'activate') {
      this.activatePreviewSource(previewState);
      return;
    }

    if (message.type === 'reveal') {
      await this.revealSourceRange(previewState, message.startOffset, message.endOffset);
      return;
    }

    if (message.type === 'openSource') {
      await this.revealSourceDocument(previewState.document, undefined, {
        viewColumn: previewState.panel.viewColumn ?? vscode.ViewColumn.Beside
      });
      return;
    }

    if (message.type === 'addComment') {
      await this.addCommentFromPreview(previewState, message);
      return;
    }

    if (message.type === 'deleteReviewItem') {
      await this.deleteReviewItemFromPreview(previewState, message);
    }
  }

  private activatePreviewSource(previewState: MarkReviewPreviewState): void {
    this.sourceTracker.rememberDocument(previewState.document);
  }

  private async revealSourceRange(
    previewState: MarkReviewPreviewState,
    startOffset: number | undefined,
    endOffset: number | undefined
  ): Promise<void> {
    if (startOffset === undefined || endOffset === undefined) {
      return;
    }

    const document = previewState.document;
    const range = new vscode.Range(
      document.positionAt(startOffset),
      document.positionAt(endOffset)
    );

    if (this.revealVisibleSourceEditors(document, range)) {
      return;
    }

    await this.revealSourceDocument(document, range, {
      viewColumn: previewState.panel.viewColumn ?? vscode.ViewColumn.Beside
    });
  }

  private async revealSourceDocument(
    document: vscode.TextDocument,
    range?: vscode.Range,
    options: RevealSourceDocumentOptions = {}
  ): Promise<vscode.TextEditor> {
    const editor = await vscode.window.showTextDocument(document, {
      preserveFocus: options.preserveFocus,
      preview: false,
      viewColumn: options.viewColumn ?? vscode.ViewColumn.Active
    });

    this.sourceTracker.rememberDocument(document);

    if (range) {
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    return editor;
  }

  private revealVisibleSourceEditors(
    document: vscode.TextDocument,
    range: vscode.Range
  ): boolean {
    const editors = this.findVisibleSourceEditors(document);
    for (const editor of editors) {
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    return editors.length > 0;
  }

  private revealVisiblePreview(
    previewState: MarkReviewPreviewState | undefined,
    target: MarkReviewRevealTarget
  ): boolean {
    if (!previewState?.panel.visible) {
      return false;
    }

    previewState.revealTarget = target;
    this.updatePreviewState(previewState);
    return true;
  }

  private findVisibleSourceEditors(document: vscode.TextDocument): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter((editor) =>
      editor.document.uri.toString() === document.uri.toString()
    );
  }

  private async addCommentFromPreview(
    previewState: MarkReviewPreviewState,
    message: WebviewMessage
  ): Promise<void> {
    const document = previewState.document;
    if (message.startOffset === undefined || message.endOffset === undefined) {
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
      document.positionAt(startOffset),
      document.positionAt(endOffset)
    );
    const selectedText = document.getText(range);
    if (selectedText.trim().length === 0) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, markCommentedText(selectedText, comment));
    await vscode.workspace.applyEdit(edit);
  }

  private async deleteReviewItemFromPreview(
    previewState: MarkReviewPreviewState,
    message: WebviewMessage
  ): Promise<void> {
    if (message.startOffset === undefined || message.endOffset === undefined) {
      return;
    }

    const confirmLabel = localize('confirm.deleteReviewItem.confirm');
    const picked = await vscode.window.showWarningMessage(
      localize('confirm.deleteReviewItem.message'),
      { modal: true },
      confirmLabel
    );
    if (picked !== confirmLabel) {
      return;
    }

    const document = previewState.document;
    const currentText = document.getText();
    const nextText = removeCriticMarkupReviewItem(
      currentText,
      message.startOffset,
      message.endOffset
    );
    if (nextText === currentText) {
      return;
    }

    const range = new vscode.Range(
      document.positionAt(message.startOffset),
      document.positionAt(message.endOffset)
    );
    const replacementText = nextText.slice(
      message.startOffset,
      nextText.length - (currentText.length - message.endOffset)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, replacementText);
    await vscode.workspace.applyEdit(edit);
  }

  private updatePreviewState(previewState: MarkReviewPreviewState): void {
    previewState.panel.title = localize('preview.title') + ': ' + vscode.workspace.asRelativePath(previewState.document.uri);
    previewState.panel.webview.html = this.createHtml(
      previewState.panel.webview,
      previewState.document,
      previewState.revealTarget
    );
    previewState.revealTarget = undefined;
  }

  private createHtml(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    revealTarget: MarkReviewRevealTarget | undefined
  ): string {
    const nonce = createNonce();
    const content = renderMarkdownPreviewContent(document.getText());
    const initialRevealTarget = revealTarget
      ? escapeScriptJson({
        startOffset: revealTarget.startOffset,
        endOffset: revealTarget.endOffset
      })
      : 'undefined';
    const addCommentLabel = escapeHtml(localize('preview.addComment'));
    const cancelLabel = escapeHtml(localize('preview.cancel'));
    const commentMenuLabel = escapeHtml(localize('preview.commentMenu'));
    const deleteReviewItemLabel = escapeHtml(localize('preview.deleteReviewItem'));
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

    .mr-context-menu button.is-hidden {
      display: none;
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

    .mr-hidden-comment.mr-active {
      display: inline;
      color: var(--vscode-descriptionForeground);
      background: rgba(255, 213, 77, 0.2);
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
  <div class="mr-context-menu" data-role="context-menu">
    <button type="button" data-command="openSource">${sourceLabel}</button>
    <button type="button" data-role="add-comment-menu-item" data-command="addComment">${commentMenuLabel}</button>
    <button type="button" data-role="delete-review-item-menu-item" data-command="deleteReviewItem">${deleteReviewItemLabel}</button>
  </div>
  <div class="mr-comment-composer" data-role="comment-composer">
    <textarea data-role="comment-input" placeholder="${commentPlaceholder}"></textarea>
    <div class="mr-comment-composer-actions">
      <button class="mr-comment-cancel" type="button" data-command="cancelComment">${cancelLabel}</button>
      <button class="mr-comment-submit" type="button" data-command="submitComment">${addCommentLabel}</button>
    </div>
  </div>
  <main class="mr-shell">
    <article class="mr-document">${content}</article>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const contextMenu = document.querySelector('[data-role="context-menu"]');
    const commentComposer = document.querySelector('[data-role="comment-composer"]');
    const commentInput = document.querySelector('[data-role="comment-input"]');
    const addCommentMenuItem = document.querySelector('[data-role="add-comment-menu-item"]');
    const deleteReviewItemMenuItem = document.querySelector('[data-role="delete-review-item-menu-item"]');
    const initialRevealTarget = ${initialRevealTarget};
    let activeReviewItem = undefined;
    let pendingReviewItem = undefined;
    let pendingSelection = undefined;
    let pendingPoint = { x: 0, y: 0 };

    window.addEventListener('focus', () => {
      vscode.postMessage({ type: 'activate' });
    });

    document.addEventListener('pointerdown', () => {
      vscode.postMessage({ type: 'activate' });
    });

    vscode.postMessage({ type: 'activate' });

    if (initialRevealTarget) {
      requestAnimationFrame(() => {
        revealReviewItem(initialRevealTarget.startOffset, initialRevealTarget.endOffset);
      });
    }

    document.addEventListener('contextmenu', (event) => {
      const selectionRange = getSelectedSourceRange();
      const reviewTarget = event.target instanceof Element
        ? event.target.closest('[data-markreview-start]')
        : null;

      event.preventDefault();
      pendingSelection = selectionRange;
      pendingReviewItem = getReviewItemFromElement(reviewTarget);
      pendingPoint = { x: event.clientX, y: event.clientY };
      addCommentMenuItem.classList.toggle('is-hidden', !selectionRange);
      deleteReviewItemMenuItem.classList.toggle('is-hidden', !pendingReviewItem);
      if (reviewTarget) {
        setActiveReviewItem(reviewTarget);
      }
      showContextMenu(event.clientX, event.clientY);
    });

    contextMenu.addEventListener('click', (event) => {
      const commandTarget = event.target instanceof Element
        ? event.target.closest('[data-command]')
        : null;
      if (commandTarget?.dataset.command !== 'deleteReviewItem') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      hideContextMenu();
      deleteReviewItem(pendingReviewItem ?? activeReviewItem);
    }, true);
    document.addEventListener('click', (event) => {
      const commandTarget = event.target instanceof Element
        ? event.target.closest('[data-command]')
        : null;

      if (commandTarget?.dataset.command === 'openSource') {
        hideContextMenu();
        vscode.postMessage({ type: 'openSource' });
        return;
      }

      if (commandTarget?.dataset.command === 'addComment') {
        hideContextMenu();
        showCommentComposer(pendingPoint.x, pendingPoint.y);
        return;
      }

      if (commandTarget?.dataset.command === 'deleteReviewItem') {
        hideContextMenu();
        deleteReviewItem(pendingReviewItem ?? activeReviewItem);
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

      if (event.target instanceof Element && event.target.closest('[data-role="context-menu"], [data-role="comment-composer"]')) {
        return;
      }

      hideContextMenu();

      const target = event.target instanceof Element
        ? event.target.closest('[data-markreview-start]')
        : null;

      if (target) {
        setActiveReviewItem(target);
        vscode.postMessage({
          type: 'reveal',
          startOffset: Number(target.dataset.markreviewStart),
          endOffset: Number(target.dataset.markreviewEnd)
        });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!activeReviewItem) {
          return;
        }

        event.preventDefault();
        deleteReviewItem(activeReviewItem);
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

    function setActiveReviewItem(target) {
      document.querySelectorAll('.mr-active').forEach((element) => {
        element.classList.remove('mr-active');
      });
      target.classList.add('mr-active');
      activeReviewItem = getReviewItemFromElement(target);
    }

    function getReviewItemFromElement(element) {
      if (!element) {
        return undefined;
      }

      const startOffset = Number(element.dataset.markreviewStart);
      const endOffset = Number(element.dataset.markreviewEnd);
      if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
        return undefined;
      }

      return { startOffset, endOffset };
    }

    function deleteReviewItem(reviewItem) {
      if (!reviewItem) {
        return;
      }

      vscode.postMessage({
        type: 'deleteReviewItem',
        startOffset: reviewItem.startOffset,
        endOffset: reviewItem.endOffset
      });
    }

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

    function revealReviewItem(startOffset, endOffset) {
      const target = findReviewTarget(startOffset, endOffset);
      if (!target) {
        return;
      }

      setActiveReviewItem(target);
      target.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth'
      });
    }

    function findReviewTarget(startOffset, endOffset) {
      const marks = Array.from(document.querySelectorAll('[data-markreview-start]'));
      const exactMatch = marks.find((element) =>
        Number(element.dataset.markreviewStart) === startOffset &&
        Number(element.dataset.markreviewEnd) === endOffset
      );
      if (exactMatch) {
        return exactMatch;
      }

      return marks.find((element) => {
        const markStartOffset = Number(element.dataset.markreviewStart);
        const markEndOffset = Number(element.dataset.markreviewEnd);

        return startOffset < markEndOffset && endOffset > markStartOffset;
      });
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

interface MarkReviewPreviewState {
  document: vscode.TextDocument;
  readonly key: string;
  readonly panel: vscode.WebviewPanel;
  revealTarget?: MarkReviewRevealTarget;
}

interface OpenPreviewDocumentOptions {
  readonly preserveFocus?: boolean;
  readonly revealTarget?: MarkReviewRevealTarget;
  readonly viewColumn?: vscode.ViewColumn;
}

interface RevealSourceDocumentOptions {
  readonly preserveFocus?: boolean;
  readonly viewColumn?: vscode.ViewColumn;
}

interface WebviewMessage {
  readonly type: 'activate' | 'reveal' | 'openSource' | 'addComment' | 'deleteReviewItem';
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

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getPreviewStateKey(uri: vscode.Uri): string {
  return uri.toString();
}

function getSourceRange(
  document: vscode.TextDocument,
  target: MarkReviewRevealTarget
): vscode.Range {
  return new vscode.Range(
    document.positionAt(target.startOffset),
    document.positionAt(target.endOffset)
  );
}

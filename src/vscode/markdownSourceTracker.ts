import * as vscode from 'vscode';

import { localize } from '../i18n/markReviewLocalization';

export class MarkdownSourceTracker implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  private activeMarkdownDocument: vscode.TextDocument | undefined;
  private activeMarkdownUri: vscode.Uri | undefined;
  private lastMarkdownUri: vscode.Uri | undefined;

  public readonly onDidChangeMarkdownSource = this.changeEmitter.event;

  public start(): vscode.Disposable {
    this.updateActiveMarkdownSource();

    return vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateActiveMarkdownSource();
      }),
      vscode.window.tabGroups.onDidChangeTabs(() => {
        this.updateActiveMarkdownSource();
      }),
      vscode.window.tabGroups.onDidChangeTabGroups(() => {
        this.updateActiveMarkdownSource();
      })
    );
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  public getActiveMarkdownEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!isMarkdownEditor(editor)) {
      return undefined;
    }

    this.rememberDocument(editor.document);
    return editor;
  }

  public getActiveMarkdownDocument(): vscode.TextDocument | undefined {
    return this.activeMarkdownDocument;
  }

  public async openMarkdownSource(
    options: OpenMarkdownSourceOptions = {}
  ): Promise<vscode.TextEditor | undefined> {
    const existingEditor = this.getActiveMarkdownEditor();
    if (existingEditor) {
      return vscode.window.showTextDocument(existingEditor.document, {
        preview: false,
        viewColumn: existingEditor.viewColumn
      });
    }

    if (this.activeMarkdownDocument) {
      return vscode.window.showTextDocument(this.activeMarkdownDocument, { preview: false });
    }

    if (!options.allowFallbackToTrackedSource) {
      void vscode.window.showWarningMessage(localize('message.openMarkdownSourceFileFirst'));
      return undefined;
    }

    const uri = this.lastMarkdownUri ?? await this.pickMarkdownSourceUri();
    if (!uri) {
      void vscode.window.showWarningMessage(localize('message.openMarkdownSourceFileFirst'));
      return undefined;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== 'markdown') {
      void vscode.window.showWarningMessage(localize('message.selectedFileNotMarkdown'));
      return undefined;
    }

    this.rememberDocument(document);
    return vscode.window.showTextDocument(document, { preview: false });
  }

  public rememberDocument(
    document: vscode.TextDocument,
    options: RememberDocumentOptions = {}
  ): void {
    const previousUri = this.activeMarkdownUri?.toString();
    const nextUri = document.uri.toString();

    this.activeMarkdownDocument = document;
    this.activeMarkdownUri = document.uri;
    this.lastMarkdownUri = document.uri;
    this.setActiveMarkdownContext(true);

    if (previousUri !== nextUri || options.forceChangeEvent) {
      this.changeEmitter.fire(document.uri);
    }
  }

  private clearActiveMarkdownDocument(): void {
    if (!this.activeMarkdownDocument && !this.activeMarkdownUri) {
      this.setActiveMarkdownContext(false);
      return;
    }

    this.activeMarkdownDocument = undefined;
    this.activeMarkdownUri = undefined;
    this.setActiveMarkdownContext(false);
    this.changeEmitter.fire(undefined);
  }

  private updateActiveMarkdownSource(): void {
    const editor = vscode.window.activeTextEditor;
    if (isMarkdownEditor(editor)) {
      this.rememberDocument(editor.document);
      return;
    }

    if (this.isActiveMarkReviewPreview()) {
      this.setActiveMarkdownContext(this.activeMarkdownDocument !== undefined);
      return;
    }

    this.clearActiveMarkdownDocument();
  }

  private isActiveMarkReviewPreview(): boolean {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;

    return activeTab?.input instanceof vscode.TabInputWebview &&
      activeTab.input.viewType === 'markReview.preview';
  }

  private setActiveMarkdownContext(hasActiveMarkdownSource: boolean): void {
    void vscode.commands.executeCommand(
      'setContext',
      'markReview.hasActiveMarkdownSource',
      hasActiveMarkdownSource
    );
  }

  private async pickMarkdownSourceUri(): Promise<vscode.Uri | undefined> {
    const uris = await vscode.workspace.findFiles(
      '**/*.{md,markdown}',
      '**/{node_modules,.git,dist,out}/**',
      100
    );

    if (uris.length === 0) {
      return undefined;
    }

    if (uris.length === 1) {
      return uris[0];
    }

    const picked = await vscode.window.showQuickPick(
      uris.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri),
        uri
      })),
      {
        placeHolder: localize('quickPick.selectMarkdownSourceFile')
      }
    );

    return picked?.uri;
  }
}

interface OpenMarkdownSourceOptions {
  readonly allowFallbackToTrackedSource?: boolean;
}

interface RememberDocumentOptions {
  readonly forceChangeEvent?: boolean;
}

function isMarkdownEditor(
  editor: vscode.TextEditor | undefined
): editor is vscode.TextEditor {
  return editor?.document.languageId === 'markdown';
}

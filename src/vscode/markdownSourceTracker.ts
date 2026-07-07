import * as vscode from 'vscode';

export class MarkdownSourceTracker implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | undefined>();
  private lastMarkdownUri: vscode.Uri | undefined;

  public readonly onDidChangeMarkdownSource = this.changeEmitter.event;

  public start(): vscode.Disposable {
    this.rememberActiveMarkdownEditor();

    return vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.languageId === 'markdown') {
          this.rememberDocument(editor.document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'markdown') {
          this.rememberDocument(document);
        }
      })
    );
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  public getActiveOrVisibleMarkdownEditor(): vscode.TextEditor | undefined {
    const editor = this.findActiveOrVisibleMarkdownEditor();

    if (editor) {
      this.rememberDocument(editor.document);
    }

    return editor;
  }

  public async getTrackedMarkdownDocument(): Promise<vscode.TextDocument | undefined> {
    const editor = this.findActiveOrVisibleMarkdownEditor();
    if (editor) {
      return editor.document;
    }

    if (!this.lastMarkdownUri) {
      return undefined;
    }

    const document = await vscode.workspace.openTextDocument(this.lastMarkdownUri);
    if (document.languageId !== 'markdown') {
      return undefined;
    }

    return document;
  }

  public async openMarkdownSource(): Promise<vscode.TextEditor | undefined> {
    const existingEditor = this.getActiveOrVisibleMarkdownEditor();
    if (existingEditor) {
      return vscode.window.showTextDocument(existingEditor.document, {
        preview: false,
        viewColumn: existingEditor.viewColumn
      });
    }

    const uri = this.lastMarkdownUri ?? await this.pickMarkdownSourceUri();
    if (!uri) {
      void vscode.window.showWarningMessage('MarkReview: Open a Markdown source file first.');
      return undefined;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    if (document.languageId !== 'markdown') {
      void vscode.window.showWarningMessage('MarkReview: The selected file is not Markdown.');
      return undefined;
    }

    this.rememberDocument(document);
    return vscode.window.showTextDocument(document, { preview: false });
  }

  public rememberDocument(document: vscode.TextDocument): void {
    const previousUri = this.lastMarkdownUri?.toString();
    const nextUri = document.uri.toString();

    this.lastMarkdownUri = document.uri;

    if (previousUri !== nextUri) {
      this.changeEmitter.fire(document.uri);
    }
  }

  private findActiveOrVisibleMarkdownEditor(): vscode.TextEditor | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.languageId === 'markdown') {
      return activeEditor;
    }

    return vscode.window.visibleTextEditors.find(
      (editor) => editor.document.languageId === 'markdown'
    );
  }

  private rememberActiveMarkdownEditor(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') {
      this.rememberDocument(editor.document);
    }
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
        placeHolder: 'Select a Markdown source file'
      }
    );

    return picked?.uri;
  }
}
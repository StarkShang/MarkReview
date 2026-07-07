import * as vscode from 'vscode';

export function getActiveMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    void vscode.window.showWarningMessage('MarkReview: Open a Markdown editor first.');
    return undefined;
  }

  if (editor.document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('MarkReview: The active editor is not Markdown.');
    return undefined;
  }

  return editor;
}

export function getWholeDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = document.lineAt(document.lineCount - 1);
  return new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(document.lineCount - 1, lastLine.text.length)
  );
}

export async function replaceNonEmptySelections(
  editor: vscode.TextEditor,
  createReplacement: (selectedText: string) => string
): Promise<boolean> {
  const selections = editor.selections.filter((selection) => !selection.isEmpty);

  if (selections.length === 0) {
    void vscode.window.showWarningMessage('MarkReview: Select Markdown text first.');
    return false;
  }

  return editor.edit((editBuilder) => {
    for (const selection of selections) {
      editBuilder.replace(selection, createReplacement(editor.document.getText(selection)));
    }
  });
}

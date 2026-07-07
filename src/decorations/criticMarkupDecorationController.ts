import * as vscode from 'vscode';

import {
  CriticMarkupPatternKind,
  createCriticMarkupPattern
} from '../core/criticMarkupPatterns';

export class CriticMarkupDecorationController implements vscode.Disposable {
  private readonly additionDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(46, 160, 67, 0.16)',
    color: '#1a7f37'
  });

  private readonly commentDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(9, 105, 218, 0.14)',
    color: '#0969da',
    fontStyle: 'italic'
  });

  private readonly deletionDecoration = vscode.window.createTextEditorDecorationType({
    color: '#cf222e',
    textDecoration: 'line-through'
  });

  private readonly highlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 235, 59, 0.28)'
  });

  private readonly replacementDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(130, 80, 223, 0.14)',
    border: '1px solid rgba(130, 80, 223, 0.35)'
  });

  public start(): vscode.Disposable {
    this.refresh(vscode.window.activeTextEditor);

    return vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.refresh(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document === event.document) {
          this.refresh(editor);
        }
      })
    );
  }

  public dispose(): void {
    this.additionDecoration.dispose();
    this.commentDecoration.dispose();
    this.deletionDecoration.dispose();
    this.highlightDecoration.dispose();
    this.replacementDecoration.dispose();
  }

  private refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'markdown') {
      return;
    }

    editor.setDecorations(
      this.additionDecoration,
      findCriticMarkupRanges(editor.document, 'Addition')
    );
    editor.setDecorations(
      this.commentDecoration,
      findCriticMarkupRanges(editor.document, 'Comment')
    );
    editor.setDecorations(
      this.deletionDecoration,
      findCriticMarkupRanges(editor.document, 'Deletion')
    );
    editor.setDecorations(
      this.highlightDecoration,
      findCriticMarkupRanges(editor.document, 'Highlight')
    );
    editor.setDecorations(
      this.replacementDecoration,
      findCriticMarkupRanges(editor.document, 'Replacement')
    );
  }
}

function findCriticMarkupRanges(
  document: vscode.TextDocument,
  kind: CriticMarkupPatternKind
): vscode.Range[] {
  const text = document.getText();
  const pattern = createCriticMarkupPattern(kind);
  const ranges: vscode.Range[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    ranges.push(
      new vscode.Range(
        document.positionAt(match.index),
        document.positionAt(match.index + match[0].length)
      )
    );
  }

  return ranges;
}

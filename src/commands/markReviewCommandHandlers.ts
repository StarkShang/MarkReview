import * as vscode from 'vscode';

import { buildAiPrompt } from '../core/aiPrompt';
import { cleanCriticMarkupMarkdown } from '../core/cleanMarkdown';
import {
  markAddedText,
  markCommentedText,
  markDeletedText,
  markReplacementText
} from '../core/criticMarkup';
import { localize } from '../i18n/markReviewLocalization';
import { MarkReviewRevealTarget } from '../review/markReviewRevealTarget';
import {
  getWholeDocumentRange,
  replaceNonEmptySelections
} from '../vscode/editorContext';
import { MarkdownSourceTracker } from '../vscode/markdownSourceTracker';

export class MarkReviewCommandHandlers {
  public constructor(private readonly sourceTracker: MarkdownSourceTracker) {}

  public async addComment(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    const comment = await vscode.window.showInputBox({
      prompt: localize('input.addComment.prompt'),
      placeHolder: localize('input.addComment.placeholder')
    });

    if (!hasMeaningfulInput(comment)) {
      return;
    }

    await replaceNonEmptySelections(editor, (selectedText) =>
      markCommentedText(selectedText, comment)
    );
  }

  public async replaceSuggestion(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    const replacement = await vscode.window.showInputBox({
      prompt: localize('input.replaceSuggestion.prompt'),
      placeHolder: localize('input.replaceSuggestion.placeholder')
    });

    if (!hasMeaningfulInput(replacement)) {
      return;
    }

    await replaceNonEmptySelections(editor, (selectedText) =>
      markReplacementText(selectedText, replacement)
    );
  }

  public async delete(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    await replaceNonEmptySelections(editor, markDeletedText);
  }

  public async addText(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    const addedText = await vscode.window.showInputBox({
      prompt: localize('input.addText.prompt'),
      placeHolder: localize('input.addText.placeholder')
    });

    if (!hasMeaningfulInput(addedText)) {
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, markAddedText(addedText));
    });
  }

  public async cleanAcceptChanges(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    const document = editor.document;
    const currentText = document.getText();
    const cleanedText = cleanCriticMarkupMarkdown(currentText);

    if (cleanedText === currentText) {
      void vscode.window.showInformationMessage(localize('message.noCriticMarkupChanges'));
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(getWholeDocumentRange(document), cleanedText);
    });
  }

  public async exportAiPrompt(): Promise<void> {
    const editor = await this.sourceTracker.openMarkdownSource();
    if (!editor) {
      return;
    }

    const prompt = buildAiPrompt(getDocumentSourceReference(editor.document));

    await vscode.env.clipboard.writeText(prompt);

    const promptDocument = await vscode.workspace.openTextDocument({
      content: prompt,
      language: 'markdown'
    });

    await vscode.window.showTextDocument(promptDocument, { preview: false });
    void vscode.window.showInformationMessage(localize('message.aiPromptCopied'));
  }

  public async openSource(): Promise<void> {
    await this.sourceTracker.openMarkdownSource();
  }

  public async revealReviewItem(target: MarkReviewRevealTarget | undefined): Promise<void> {
    if (!target) {
      await this.openSource();
      return;
    }

    const document = await vscode.workspace.openTextDocument(target.uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const startPosition = document.positionAt(target.startOffset);
    const endPosition = document.positionAt(target.endOffset);
    const range = new vscode.Range(startPosition, endPosition);

    this.sourceTracker.rememberDocument(document);
    editor.selection = new vscode.Selection(startPosition, endPosition);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

function hasMeaningfulInput(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function getDocumentSourceReference(document: vscode.TextDocument): string {
  return document.uri.scheme === 'file'
    ? document.uri.fsPath
    : document.uri.toString();
}

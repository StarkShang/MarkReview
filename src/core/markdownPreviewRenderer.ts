import { parseCriticMarkupReviewItems } from './criticMarkupReviewItem';

interface MarkdownLine {
  readonly text: string;
  readonly startOffset: number;
}

interface MarkdownPreviewRenderContext {
  readonly multilineComments: ReadonlyMap<number, MultilineCriticComment>;
}

interface MultilineCriticComment {
  readonly commentText: string;
  readonly endOffset: number;
  readonly markedText?: string;
  readonly startOffset: number;
}

interface PreparedMarkdownPreview {
  readonly context: MarkdownPreviewRenderContext;
  readonly markdown: string;
}

interface SourceRange {
  readonly endOffset: number;
  readonly startOffset: number;
}

interface ListMarker {
  readonly indent: number;
  readonly markerLength: number;
  readonly ordered: boolean;
}

export function renderMarkdownPreviewContent(markdown: string): string {
  const preparedPreview = prepareMarkdownPreview(markdown);
  const lines = splitMarkdownLines(preparedPreview.markdown);
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlankLine(line.text)) {
      index += 1;
      continue;
    }

    const codeFence = getCodeFence(line.text);
    if (codeFence) {
      const result = renderCodeFence(lines, index, codeFence);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    const mathBlock = tryRenderMathBlock(lines, index);
    if (mathBlock) {
      blocks.push(mathBlock.html);
      index = mathBlock.nextIndex;
      continue;
    }

    const heading = line.text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const contentOffset = line.startOffset + heading[1].length + 1;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2], contentOffset, preparedPreview.context)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line.text)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const result = renderTable(lines, index, preparedPreview.context);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    if (isListLine(line.text)) {
      const result = renderList(lines, index, preparedPreview.context);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line.text)) {
      const result = renderBlockquote(lines, index, preparedPreview.context);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    const result = renderParagraph(lines, index, preparedPreview.context);
    blocks.push(result.html);
    index = result.nextIndex;
  }

  return blocks.join('\n');
}

function prepareMarkdownPreview(markdown: string): PreparedMarkdownPreview {
  const characters = markdown.split('');
  const multilineComments = new Map<number, MultilineCriticComment>();
  const protectedRanges = collectProtectedBlockRanges(markdown);

  for (const reviewItem of parseCriticMarkupReviewItems(markdown)) {
    if (reviewItem.kind !== 'Comment' && reviewItem.kind !== 'StandaloneComment') {
      continue;
    }

    if (isOffsetInRanges(reviewItem.startOffset, protectedRanges)) {
      continue;
    }

    const source = markdown.slice(reviewItem.startOffset, reviewItem.endOffset);
    const commentMarkerIndex = source.indexOf('{>>');
    if (commentMarkerIndex === -1) {
      continue;
    }

    const commentText = source.slice(commentMarkerIndex + 3, -3);
    if (!/[\r\n]/.test(commentText)) {
      continue;
    }

    const markedText = reviewItem.kind === 'Comment'
      ? source.slice(3, commentMarkerIndex - 3)
      : undefined;
    multilineComments.set(reviewItem.startOffset, {
      commentText,
      endOffset: reviewItem.endOffset,
      markedText,
      startOffset: reviewItem.startOffset
    });

    const commentContentStartOffset = reviewItem.startOffset + commentMarkerIndex + 3;
    for (let offset = commentContentStartOffset; offset < reviewItem.endOffset; offset += 1) {
      if (characters[offset] !== '\r' && characters[offset] !== '\n') {
        characters[offset] = ' ';
      }
    }
  }

  return {
    context: {
      multilineComments
    },
    markdown: characters.join('')
  };
}

function collectProtectedBlockRanges(markdown: string): SourceRange[] {
  const lines = splitMarkdownLines(markdown);
  const ranges: SourceRange[] = [];
  let index = 0;

  while (index < lines.length) {
    const startIndex = index;
    const codeFence = getCodeFence(lines[index].text);
    if (codeFence) {
      index += 1;
      const fenceCharacter = codeFence[0];
      while (index < lines.length) {
        const isClosingFence = lines[index].text.startsWith(
          fenceCharacter.repeat(codeFence.length)
        );
        index += 1;
        if (isClosingFence) {
          break;
        }
      }

      ranges.push(createLineRange(lines, startIndex, index, markdown.length));
      continue;
    }

    const mathBlock = tryRenderMathBlock(lines, index);
    if (mathBlock) {
      index = mathBlock.nextIndex;
      ranges.push(createLineRange(lines, startIndex, index, markdown.length));
      continue;
    }

    index += 1;
  }

  return ranges;
}

function createLineRange(
  lines: MarkdownLine[],
  startIndex: number,
  nextIndex: number,
  markdownLength: number
): SourceRange {
  return {
    startOffset: lines[startIndex].startOffset,
    endOffset: nextIndex < lines.length
      ? lines[nextIndex].startOffset
      : markdownLength
  };
}

function isOffsetInRanges(offset: number, ranges: SourceRange[]): boolean {
  return ranges.some((range) =>
    offset >= range.startOffset && offset < range.endOffset
  );
}

function splitMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  const linePattern = /.*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(markdown)) !== null) {
    if (match[0].length === 0 && match.index === markdown.length) {
      break;
    }

    const rawLine = match[0];
    const text = rawLine.replace(/\r\n$|\n$|\r$/, '');
    lines.push({
      text,
      startOffset: match.index
    });

    if (linePattern.lastIndex === markdown.length) {
      break;
    }
  }

  return lines;
}

function renderCodeFence(
  lines: MarkdownLine[],
  startIndex: number,
  openingFence: string
): { readonly html: string; readonly nextIndex: number } {
  const codeLines: string[] = [];
  const fenceCharacter = openingFence[0];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line.text.startsWith(fenceCharacter.repeat(openingFence.length))) {
      index += 1;
      break;
    }

    codeLines.push(line.text);
    index += 1;
  }

  return {
    html: `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    nextIndex: index
  };
}

function tryRenderMathBlock(
  lines: MarkdownLine[],
  startIndex: number
): { readonly html: string; readonly nextIndex: number } | undefined {
  const openingLine = lines[startIndex];
  const trimmedOpeningLine = openingLine.text.trim();
  const indentation = openingLine.text.length - openingLine.text.trimStart().length;
  if (indentation > 3 || !trimmedOpeningLine.startsWith('$$')) {
    return undefined;
  }

  if (trimmedOpeningLine.length > 4 && trimmedOpeningLine.endsWith('$$')) {
    const math = trimmedOpeningLine.slice(2, -2).trim();
    if (math.length === 0) {
      return undefined;
    }

    const delimiterStart = openingLine.text.indexOf('$$');
    return {
      html: renderMath(math, true, openingLine.startOffset + delimiterStart, openingLine.startOffset + openingLine.text.length),
      nextIndex: startIndex + 1
    };
  }

  if (trimmedOpeningLine !== '$$') {
    return undefined;
  }

  const mathLines: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length && !/^\s{0,3}\$\$\s*$/.test(lines[index].text)) {
    mathLines.push(lines[index].text);
    index += 1;
  }

  if (index >= lines.length) {
    return undefined;
  }

  const math = mathLines.join('\n').trim();
  if (math.length === 0) {
    return undefined;
  }

  const closingLine = lines[index];
  const delimiterStart = openingLine.text.indexOf('$$');
  const delimiterEnd = closingLine.text.indexOf('$$') + 2;
  return {
    html: renderMath(
      math,
      true,
      openingLine.startOffset + delimiterStart,
      closingLine.startOffset + delimiterEnd
    ),
    nextIndex: index + 1
  };
}

function renderTable(
  lines: MarkdownLine[],
  startIndex: number,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } {
  const headerLine = lines[startIndex];
  const rows: MarkdownLine[] = [];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].text.includes('|') && !isBlankLine(lines[index].text)) {
    rows.push(lines[index]);
    index += 1;
  }

  const headers = splitTableCells(headerLine.text);
  const headerHtml = headers
    .map((cell) => `<th>${renderInlineMarkdown(cell.text, headerLine.startOffset + cell.start, context)}</th>`)
    .join('');
  const bodyHtml = rows
    .map((row) => {
      const cells = splitTableCells(row.text)
        .map((cell) => `<td>${renderInlineMarkdown(cell.text, row.startOffset + cell.start, context)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: index
  };
}

function renderList(
  lines: MarkdownLine[],
  startIndex: number,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } {
  const firstMarker = parseListMarker(lines[startIndex].text);
  if (!firstMarker) {
    return {
      html: '',
      nextIndex: startIndex + 1
    };
  }

  return renderListAtIndent(lines, startIndex, firstMarker.indent, firstMarker.ordered, context);
}

function renderListAtIndent(
  lines: MarkdownLine[],
  startIndex: number,
  indent: number,
  ordered: boolean,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } {
  const tagName = ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const marker = parseListMarker(lines[index].text);
    if (!marker || marker.indent !== indent || marker.ordered !== ordered) {
      break;
    }

    const itemHtml: string[] = [
      renderInlineMarkdown(
        lines[index].text.slice(marker.markerLength),
        lines[index].startOffset + marker.markerLength,
        context
      )
    ];
    index += 1;

    while (index < lines.length) {
      if (isBlankLine(lines[index].text)) {
        const nextContentIndex = findNextContentLine(lines, index + 1);
        if (nextContentIndex === -1) {
          index += 1;
          break;
        }

        const nextMarker = parseListMarker(lines[nextContentIndex].text);
        if (!nextMarker) {
          break;
        }

        if (nextMarker.indent > marker.indent) {
          index = nextContentIndex;
          continue;
        }

        index = nextContentIndex;
        break;
      }

      const nextMarker = parseListMarker(lines[index].text);
      if (!nextMarker) {
        break;
      }

      if (nextMarker.indent <= marker.indent) {
        break;
      }

      const nestedList = renderListAtIndent(
        lines,
        index,
        nextMarker.indent,
        nextMarker.ordered,
        context
      );
      itemHtml.push(nestedList.html);
      index = nestedList.nextIndex;
    }

    items.push(`<li>${itemHtml.join('')}</li>`);
  }

  return {
    html: `<${tagName}>${items.join('')}</${tagName}>`,
    nextIndex: index
  };
}

function parseListMarker(line: string): ListMarker | undefined {
  const match = line.match(/^(\s*)(?:[-*+] |\d+\.\s+)/);
  if (!match) {
    return undefined;
  }

  return {
    indent: match[1].length,
    markerLength: match[0].length,
    ordered: /\d+\.\s+$/.test(match[0])
  };
}

function findNextContentLine(lines: MarkdownLine[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length) {
    if (!isBlankLine(lines[index].text)) {
      return index;
    }

    index += 1;
  }

  return -1;
}

function renderBlockquote(
  lines: MarkdownLine[],
  startIndex: number,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } {
  const quoteLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index].text)) {
    const marker = lines[index].text.match(/^\s{0,3}>\s?/);
    const markerLength = marker?.[0].length ?? 0;
    quoteLines.push(renderInlineMarkdown(
      lines[index].text.slice(markerLength),
      lines[index].startOffset + markerLength,
      context
    ));
    index += 1;
  }

  return {
    html: `<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`,
    nextIndex: index
  };
}

function renderParagraph(
  lines: MarkdownLine[],
  startIndex: number,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } {
  const paragraphLines: MarkdownLine[] = [];
  let index = startIndex;

  while (index < lines.length && !isBlankLine(lines[index].text) && !isBlockBoundary(lines, index)) {
    paragraphLines.push(lines[index]);
    index += 1;
  }

  const content = paragraphLines
    .map((line) => renderInlineMarkdown(line.text, line.startOffset, context))
    .join('<br>');

  return {
    html: `<p>${content}</p>`,
    nextIndex: index
  };
}

function renderInlineMarkdown(
  text: string,
  baseOffset: number,
  context: MarkdownPreviewRenderContext
): string {
  let html = '';
  let index = 0;

  while (index < text.length) {
    const markerHtml = tryRenderCriticMarkup(text, index, baseOffset, context);
    if (markerHtml) {
      html += markerHtml.html;
      index = markerHtml.nextIndex;
      continue;
    }

    const nextMarkerIndex = findNextCriticMarkupStart(text, index + 1);
    const endIndex = nextMarkerIndex === -1 ? text.length : nextMarkerIndex;
    html += renderPlainInlineWithOffsets(text.slice(index, endIndex), baseOffset + index);
    index = endIndex;
  }

  return html;
}

function tryRenderCriticMarkup(
  text: string,
  index: number,
  baseOffset: number,
  context: MarkdownPreviewRenderContext
): { readonly html: string; readonly nextIndex: number } | undefined {
  const multilineComment = context.multilineComments.get(baseOffset + index);
  if (multilineComment) {
    const className = multilineComment.markedText === undefined
      ? 'mr-hidden-comment'
      : 'mr-commented';
    const content = multilineComment.markedText === undefined
      ? renderMultilineCommentText(multilineComment.commentText)
      : renderPlainInline(multilineComment.markedText);
    return renderMarkedSpan(
      className,
      multilineComment.startOffset,
      multilineComment.endOffset,
      content,
      text.length
    );
  }

  if (text.startsWith('{++', index)) {
    const endIndex = text.indexOf('++}', index + 3);
    if (endIndex !== -1) {
      return renderMarkedSpan(
        'mr-addition',
        baseOffset + index,
        baseOffset + endIndex + 3,
        renderPlainInline(text.slice(index + 3, endIndex)),
        endIndex + 3
      );
    }
  }

  if (text.startsWith('{--', index)) {
    const endIndex = text.indexOf('--}', index + 3);
    if (endIndex !== -1) {
      return renderMarkedSpan(
        'mr-deletion',
        baseOffset + index,
        baseOffset + endIndex + 3,
        renderPlainInline(text.slice(index + 3, endIndex)),
        endIndex + 3
      );
    }
  }

  if (text.startsWith('{~~', index)) {
    const separatorIndex = text.indexOf('~>', index + 3);
    const endIndex = separatorIndex === -1 ? -1 : text.indexOf('~~}', separatorIndex + 2);
    if (separatorIndex !== -1 && endIndex !== -1) {
      const oldText = renderPlainInline(text.slice(index + 3, separatorIndex));
      const newText = renderPlainInline(text.slice(separatorIndex + 2, endIndex));
      return renderMarkedSpan(
        'mr-replacement',
        baseOffset + index,
        baseOffset + endIndex + 3,
        `<span class="mr-replacement-old">${oldText}</span><span class="mr-replacement-arrow">-&gt;</span><span class="mr-replacement-new">${newText}</span>`,
        endIndex + 3
      );
    }
  }

  if (text.startsWith('{==', index)) {
    const highlightEndIndex = text.indexOf('==}', index + 3);
    if (highlightEndIndex !== -1) {
      const commentStartIndex = highlightEndIndex + 3;
      if (text.startsWith('{>>', commentStartIndex)) {
        const commentEndIndex = text.indexOf('<<}', commentStartIndex + 3);
        if (commentEndIndex !== -1) {
          const markedText = renderPlainInline(text.slice(index + 3, highlightEndIndex));
          return renderMarkedSpan(
            'mr-commented',
            baseOffset + index,
            baseOffset + commentEndIndex + 3,
            markedText,
            commentEndIndex + 3
          );
        }
      }

      return renderMarkedSpan(
        'mr-highlight',
        baseOffset + index,
        baseOffset + highlightEndIndex + 3,
        renderPlainInline(text.slice(index + 3, highlightEndIndex)),
        highlightEndIndex + 3
      );
    }
  }

  if (text.startsWith('{>>', index)) {
    const endIndex = text.indexOf('<<}', index + 3);
    if (endIndex !== -1) {
      return renderMarkedSpan(
        'mr-hidden-comment',
        baseOffset + index,
        baseOffset + endIndex + 3,
        renderPlainInline(text.slice(index + 3, endIndex)),
        endIndex + 3
      );
    }
  }

  return undefined;
}

function renderMultilineCommentText(commentText: string): string {
  return commentText
    .trim()
    .split(/\r\n|\n|\r/)
    .map((line) => renderPlainInline(line))
    .join('<br>');
}

function renderMarkedSpan(
  className: string,
  startOffset: number,
  endOffset: number,
  content: string,
  nextIndex: number
): { readonly html: string; readonly nextIndex: number } {
  return {
    html: `<span class="mr-mark ${className}" data-markreview-start="${startOffset}" data-markreview-end="${endOffset}">${content}</span>`,
    nextIndex
  };
}

function renderPlainInlineWithOffsets(text: string, baseOffset: number): string {
  if (text.length === 0) {
    return '';
  }

  return `<span data-markreview-text-start="${baseOffset}" data-markreview-text-end="${baseOffset + text.length}">${renderPlainInline(text, baseOffset)}</span>`;
}

function renderPlainInline(text: string, baseOffset?: number): string {
  const protectedSegments: string[] = [];
  const placeholderPrefix = getInlinePlaceholderPrefix(text);
  let protectedText = '';
  let index = 0;

  while (index < text.length) {
    if (text[index] === '`' && !isEscaped(text, index)) {
      const codeEndIndex = text.indexOf('`', index + 1);
      if (codeEndIndex !== -1) {
        protectedText += createInlinePlaceholder(placeholderPrefix, protectedSegments.length);
        protectedSegments.push(`<code>${escapeHtml(text.slice(index + 1, codeEndIndex))}</code>`);
        index = codeEndIndex + 1;
        continue;
      }
    }

    if (isInlineMathStart(text, index)) {
      const mathEndIndex = findInlineMathEnd(text, index + 1);
      if (mathEndIndex !== -1) {
        protectedText += createInlinePlaceholder(placeholderPrefix, protectedSegments.length);
        protectedSegments.push(renderMath(
          text.slice(index + 1, mathEndIndex),
          false,
          baseOffset === undefined ? undefined : baseOffset + index,
          baseOffset === undefined ? undefined : baseOffset + mathEndIndex + 1
        ));
        index = mathEndIndex + 1;
        continue;
      }
    }

    protectedText += text[index];
    index += 1;
  }

  let html = escapeHtml(protectedText);

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  for (let segmentIndex = 0; segmentIndex < protectedSegments.length; segmentIndex += 1) {
    html = html.replace(
      createInlinePlaceholder(placeholderPrefix, segmentIndex),
      protectedSegments[segmentIndex]
    );
  }

  return html;
}

function renderMath(
  math: string,
  displayMode: boolean,
  startOffset?: number,
  endOffset?: number
): string {
  const tagName = displayMode ? 'div' : 'span';
  const className = displayMode ? 'mr-math mr-math-block language-math' : 'mr-math mr-math-inline language-math';
  const sourceAttributes = startOffset === undefined || endOffset === undefined
    ? ''
    : ` data-markreview-math-start="${startOffset}" data-markreview-math-end="${endOffset}"`;

  return `<${tagName} class="${className}" data-math="${escapeHtml(math)}" data-math-display="${displayMode}"${sourceAttributes}>${escapeHtml(math)}</${tagName}>`;
}

function getInlinePlaceholderPrefix(text: string): string {
  let prefix = '\uE000MR';
  while (text.includes(prefix)) {
    prefix += 'R';
  }

  return prefix;
}

function createInlinePlaceholder(prefix: string, index: number): string {
  return `${prefix}${index}\uE001`;
}

function isInlineMathStart(text: string, index: number): boolean {
  return text[index] === '$' &&
    text[index - 1] !== '$' &&
    text[index + 1] !== '$' &&
    text[index + 1] !== undefined &&
    !/\s/.test(text[index + 1]) &&
    !isEscaped(text, index);
}

function findInlineMathEnd(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index += 1) {
    if (
      text[index] !== '$' ||
      text[index - 1] === '$' ||
      text[index + 1] === '$' ||
      isEscaped(text, index)
    ) {
      continue;
    }

    if (index > startIndex && !/\s/.test(text[index - 1])) {
      return index;
    }
  }

  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function findNextCriticMarkupStart(text: string, startIndex: number): number {
  const starts = ['{++', '{--', '{~~', '{==', '{>>']
    .map((marker) => text.indexOf(marker, startIndex))
    .filter((index) => index !== -1);

  return starts.length === 0 ? -1 : Math.min(...starts);
}

function splitTableCells(line: string): Array<{ readonly text: string; readonly start: number }> {
  const trimmedStart = line.startsWith('|') ? 1 : 0;
  const trimmedEnd = line.endsWith('|') ? line.length - 1 : line.length;
  const content = line.slice(trimmedStart, trimmedEnd);
  const cells: Array<{ readonly text: string; readonly start: number }> = [];
  let cursor = 0;

  for (const cell of content.split('|')) {
    const leadingWhitespace = cell.length - cell.trimStart().length;
    cells.push({
      text: cell.trim(),
      start: trimmedStart + cursor + leadingWhitespace
    });
    cursor += cell.length + 1;
  }

  return cells;
}

function getCodeFence(line: string): string | undefined {
  const match = line.match(/^(`{3,}|~{3,})/);
  return match?.[1];
}

function isTableStart(lines: MarkdownLine[], index: number): boolean {
  return index + 1 < lines.length &&
    lines[index].text.includes('|') &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1].text);
}

function isListLine(line: string): boolean {
  return parseListMarker(line) !== undefined;
}

function isBlockBoundary(lines: MarkdownLine[], index: number): boolean {
  const line = lines[index].text;
  return Boolean(
    getCodeFence(line) ||
    tryRenderMathBlock(lines, index) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    isTableStart(lines, index) ||
    isListLine(line) ||
    /^\s{0,3}>\s?/.test(line)
  );
}

function isBlankLine(line: string): boolean {
  return /^\s*$/.test(line);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

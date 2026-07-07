interface MarkdownLine {
  readonly text: string;
  readonly startOffset: number;
}

export function renderMarkdownPreviewContent(markdown: string): string {
  const lines = splitMarkdownLines(markdown);
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

    const heading = line.text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const contentOffset = line.startOffset + heading[1].length + 1;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2], contentOffset)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line.text)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const result = renderTable(lines, index);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    if (isListLine(line.text)) {
      const result = renderList(lines, index);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line.text)) {
      const result = renderBlockquote(lines, index);
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }

    const result = renderParagraph(lines, index);
    blocks.push(result.html);
    index = result.nextIndex;
  }

  return blocks.join('\n');
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

function renderTable(
  lines: MarkdownLine[],
  startIndex: number
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
    .map((cell) => `<th>${renderInlineMarkdown(cell.text, headerLine.startOffset + cell.start)}</th>`)
    .join('');
  const bodyHtml = rows
    .map((row) => {
      const cells = splitTableCells(row.text)
        .map((cell) => `<td>${renderInlineMarkdown(cell.text, row.startOffset + cell.start)}</td>`)
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
  startIndex: number
): { readonly html: string; readonly nextIndex: number } {
  const ordered = /^\s*\d+\.\s+/.test(lines[startIndex].text);
  const tagName = ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length && isListLine(lines[index].text)) {
    const marker = lines[index].text.match(/^\s*(?:[-*+] |\d+\.\s+)/);
    const markerLength = marker?.[0].length ?? 0;
    const itemText = lines[index].text.slice(markerLength);
    items.push(`<li>${renderInlineMarkdown(itemText, lines[index].startOffset + markerLength)}</li>`);
    index += 1;
  }

  return {
    html: `<${tagName}>${items.join('')}</${tagName}>`,
    nextIndex: index
  };
}

function renderBlockquote(
  lines: MarkdownLine[],
  startIndex: number
): { readonly html: string; readonly nextIndex: number } {
  const quoteLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index].text)) {
    const marker = lines[index].text.match(/^\s{0,3}>\s?/);
    const markerLength = marker?.[0].length ?? 0;
    quoteLines.push(renderInlineMarkdown(lines[index].text.slice(markerLength), lines[index].startOffset + markerLength));
    index += 1;
  }

  return {
    html: `<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`,
    nextIndex: index
  };
}

function renderParagraph(
  lines: MarkdownLine[],
  startIndex: number
): { readonly html: string; readonly nextIndex: number } {
  const paragraphLines: MarkdownLine[] = [];
  let index = startIndex;

  while (index < lines.length && !isBlankLine(lines[index].text) && !isBlockBoundary(lines, index)) {
    paragraphLines.push(lines[index]);
    index += 1;
  }

  const content = paragraphLines
    .map((line) => renderInlineMarkdown(line.text, line.startOffset))
    .join('<br>');

  return {
    html: `<p>${content}</p>`,
    nextIndex: index
  };
}

function renderInlineMarkdown(text: string, baseOffset: number): string {
  let html = '';
  let index = 0;

  while (index < text.length) {
    const markerHtml = tryRenderCriticMarkup(text, index, baseOffset);
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
  baseOffset: number
): { readonly html: string; readonly nextIndex: number } | undefined {
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
        '',
        endIndex + 3
      );
    }
  }

  return undefined;
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

  return `<span data-markreview-text-start="${baseOffset}" data-markreview-text-end="${baseOffset + text.length}">${renderPlainInline(text)}</span>`;
}

function renderPlainInline(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  return html;
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
  return /^\s*(?:[-*+] |\d+\.\s+)/.test(line);
}

function isBlockBoundary(lines: MarkdownLine[], index: number): boolean {
  const line = lines[index].text;
  return Boolean(
    getCodeFence(line) ||
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
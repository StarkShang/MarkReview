export type CriticMarkupReviewItemKind =
  | 'Addition'
  | 'Comment'
  | 'Deletion'
  | 'Highlight'
  | 'Replacement'
  | 'StandaloneComment';

export interface CriticMarkupReviewItem {
  readonly id: string;
  readonly kind: CriticMarkupReviewItemKind;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly label: string;
  readonly detail: string;
}

interface ClaimedRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export function parseCriticMarkupReviewItems(markdown: string): CriticMarkupReviewItem[] {
  const reviewItems: CriticMarkupReviewItem[] = [];
  const claimedRanges: ClaimedRange[] = [];

  collectCommentPairs(markdown, reviewItems, claimedRanges);
  collectReplacementItems(markdown, reviewItems, claimedRanges);
  collectDeletionItems(markdown, reviewItems, claimedRanges);
  collectAdditionItems(markdown, reviewItems, claimedRanges);
  collectStandaloneCommentItems(markdown, reviewItems, claimedRanges);
  collectStandaloneHighlightItems(markdown, reviewItems, claimedRanges);

  return reviewItems.sort((first, second) => first.startOffset - second.startOffset);
}

function collectCommentPairs(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{==([\s\S]*?)==\}\{>>([\s\S]*?)<<\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    const markedText = normalizeInlineText(match[1]);
    const commentText = normalizeInlineText(match[2]);
    addReviewItem(reviewItems, claimedRanges, {
      kind: 'Comment',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(commentText),
      detail: truncateText(markedText, 120)
    });
  }
}

function collectReplacementItems(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (isClaimed(claimedRanges, match.index, match.index + match[0].length)) {
      continue;
    }

    addReviewItem(reviewItems, claimedRanges, {
      kind: 'Replacement',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(normalizeInlineText(match[1])),
      detail: truncateText(normalizeInlineText(match[2]), 120)
    });
  }
}

function collectDeletionItems(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{--([\s\S]*?)--\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (isClaimed(claimedRanges, match.index, match.index + match[0].length)) {
      continue;
    }

    addReviewItem(reviewItems, claimedRanges, {
      kind: 'Deletion',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(normalizeInlineText(match[1])),
      detail: 'Deletion suggestion'
    });
  }
}

function collectAdditionItems(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{\+\+([\s\S]*?)\+\+\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (isClaimed(claimedRanges, match.index, match.index + match[0].length)) {
      continue;
    }

    addReviewItem(reviewItems, claimedRanges, {
      kind: 'Addition',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(normalizeInlineText(match[1])),
      detail: 'Addition suggestion'
    });
  }
}

function collectStandaloneCommentItems(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{>>([\s\S]*?)<<\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (isClaimed(claimedRanges, match.index, match.index + match[0].length)) {
      continue;
    }

    addReviewItem(reviewItems, claimedRanges, {
      kind: 'StandaloneComment',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(normalizeInlineText(match[1])),
      detail: 'Standalone comment'
    });
  }
}

function collectStandaloneHighlightItems(
  markdown: string,
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[]
): void {
  const pattern = /\{==([\s\S]*?)==\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (isClaimed(claimedRanges, match.index, match.index + match[0].length)) {
      continue;
    }

    addReviewItem(reviewItems, claimedRanges, {
      kind: 'Highlight',
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      label: truncateText(normalizeInlineText(match[1])),
      detail: 'Marked text without a comment'
    });
  }
}

function addReviewItem(
  reviewItems: CriticMarkupReviewItem[],
  claimedRanges: ClaimedRange[],
  item: Omit<CriticMarkupReviewItem, 'id'>
): void {
  const id = `${item.kind}:${item.startOffset}:${item.endOffset}`;
  reviewItems.push({ ...item, id });
  claimedRanges.push({
    startOffset: item.startOffset,
    endOffset: item.endOffset
  });
}

function isClaimed(
  claimedRanges: ClaimedRange[],
  startOffset: number,
  endOffset: number
): boolean {
  return claimedRanges.some((range) =>
    startOffset < range.endOffset && endOffset > range.startOffset
  );
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength = 80): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
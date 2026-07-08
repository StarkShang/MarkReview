export function cleanCriticMarkupMarkdown(markdown: string): string {
  return markdown
    .replace(/\{\+\+([\s\S]*?)\+\+\}/g, '$1')
    .replace(/\{--[\s\S]*?--\}/g, '')
    .replace(/\{~~[\s\S]*?~>([\s\S]*?)~~\}/g, '$1')
    .replace(/\{==([\s\S]*?)==\}\{>>[\s\S]*?<<\}/g, '$1')
    .replace(/\{==([\s\S]*?)==\}/g, '$1')
    .replace(/\{>>[\s\S]*?<<\}/g, '');
}

export function removeCriticMarkupReviewItem(markdown: string, startOffset: number, endOffset: number): string {
  if (startOffset < 0 || endOffset <= startOffset || endOffset > markdown.length) {
    return markdown;
  }

  const before = markdown.slice(0, startOffset);
  const reviewItem = markdown.slice(startOffset, endOffset);
  const after = markdown.slice(endOffset);
  const replacement = unwrapCriticMarkupReviewItem(reviewItem);

  if (replacement === undefined) {
    return markdown;
  }

  return before + replacement + after;
}

function unwrapCriticMarkupReviewItem(reviewItem: string): string | undefined {
  let match = reviewItem.match(/^\{\+\+([\s\S]*?)\+\+\}$/);
  if (match) {
    return match[1];
  }

  match = reviewItem.match(/^\{--([\s\S]*?)--\}$/);
  if (match) {
    return match[1];
  }

  match = reviewItem.match(/^\{~~([\s\S]*?)~>[\s\S]*?~~\}$/);
  if (match) {
    return match[1];
  }

  match = reviewItem.match(/^\{==([\s\S]*?)==\}\{>>[\s\S]*?<<\}$/);
  if (match) {
    return match[1];
  }

  match = reviewItem.match(/^\{==([\s\S]*?)==\}$/);
  if (match) {
    return match[1];
  }

  if (/^\{>>[\s\S]*?<<\}$/.test(reviewItem)) {
    return '';
  }

  return undefined;
}

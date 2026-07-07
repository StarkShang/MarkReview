export function markAddedText(text: string): string {
  return `{++${text}++}`;
}

export function markComment(comment: string): string {
  return `{>>${comment}<<}`;
}

export function markCommentedText(text: string, comment: string): string {
  return `${markHighlightedText(text)}${markComment(comment)}`;
}

export function markDeletedText(text: string): string {
  return `{--${text}--}`;
}

export function markHighlightedText(text: string): string {
  return `{==${text}==}`;
}

export function markReplacementText(oldText: string, newText: string): string {
  return `{~~${oldText}~>${newText}~~}`;
}

export function buildAiPrompt(markdown: string): string {
  const markdownFence = createMarkdownFence(markdown);

  return [
    'You are a careful Markdown editing assistant. Update the Markdown document according to the CriticMarkup markers and output clean Markdown.',
    '',
    'CriticMarkup rules:',
    '- {++added text++} means added text. Keep the added text and remove the marker.',
    '- {--deleted text--} means deleted text. Remove this text and remove the marker.',
    '- {~~old text~>new text~~} means replacement. Use the new text and remove the marker.',
    '- {==marked text==}{>>comment<<} means a review comment. Rewrite the marked text according to the comment and remove both markers.',
    '',
    'Requirements:',
    '- Output only the final clean Markdown.',
    '- Do not keep any CriticMarkup markers.',
    '- Preserve Markdown structure, including headings, lists, tables, blockquotes, code blocks, links, and images.',
    '- Do not rewrite unrelated text unless a small adjustment is needed for local coherence.',
    '- If a comment is ambiguous, choose the most conservative edit that fits the surrounding context.',
    '',
    'Markdown document:',
    '',
    `${markdownFence}markdown`,
    markdown,
    markdownFence
  ].join('\n');
}

function createMarkdownFence(markdown: string): string {
  const fenceMatches = markdown.match(/`{3,}/g) ?? [];
  const longestFenceLength = fenceMatches.reduce(
    (longestLength, fence) => Math.max(longestLength, fence.length),
    3
  );

  return '`'.repeat(longestFenceLength + 1);
}
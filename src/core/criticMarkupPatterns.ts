export const CriticMarkupPatternSource = {
  Addition: String.raw`\{\+\+[\s\S]*?\+\+\}`,
  Comment: String.raw`\{>>[\s\S]*?<<\}`,
  Deletion: String.raw`\{--[\s\S]*?--\}`,
  Highlight: String.raw`\{==[\s\S]*?==\}`,
  Replacement: String.raw`\{~~[\s\S]*?~>[\s\S]*?~~\}`
} as const;

export type CriticMarkupPatternKind =
  keyof typeof CriticMarkupPatternSource;

export function createCriticMarkupPattern(kind: CriticMarkupPatternKind): RegExp {
  return new RegExp(CriticMarkupPatternSource[kind], 'g');
}

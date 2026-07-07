export function cleanCriticMarkupMarkdown(markdown: string): string {
  return markdown
    .replace(/\{\+\+([\s\S]*?)\+\+\}/g, '$1')
    .replace(/\{--[\s\S]*?--\}/g, '')
    .replace(/\{~~[\s\S]*?~>([\s\S]*?)~~\}/g, '$1')
    .replace(/\{==([\s\S]*?)==\}\{>>[\s\S]*?<<\}/g, '$1')
    .replace(/\{==([\s\S]*?)==\}/g, '$1')
    .replace(/\{>>[\s\S]*?<<\}/g, '');
}

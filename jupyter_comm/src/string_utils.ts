export function toHTMLEntities(str: string): string {
  return String(str)
    .replace(/ /g, '&nbsp;')
    // .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

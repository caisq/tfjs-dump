export function toHTMLEntities(str: string): string {
  return String(str)
    .replace(/ /g, '&nbsp;')
    // .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function convertLeadingEntities(str: string): string {
  // TODO(cais): Handle leading tabs.
  let firstNonSpace = 0;
  while (str[firstNonSpace] === ' ') {
    firstNonSpace++;
  }
  let out = '';
  for (let i = 0; i < firstNonSpace; ++i) {
    out += '&nbsp;';
  }
  out += str.slice(firstNonSpace);
  return out;
}
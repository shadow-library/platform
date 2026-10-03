export interface PageText {
  title: string | null;
  text: string;
}

const DROPPED_ELEMENTS = /<(script|style|noscript|template|svg|iframe|canvas|head|title|nav|footer|aside|form|button|select)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_ENDS = /<\/(p|div|section|article|main|header|h[1-6]|dt|dd|tr|table|ul|ol|dl|blockquote|pre|figure|figcaption)\s*>/gi;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

function codePoint(value: number): string {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff) ? String.fromCodePoint(value) : '';
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return codePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return codePoint(Number.parseInt(name.slice(1), 10));
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** Collapses runs of spaces inside each line, drops empty markers, and leaves at most one blank line between blocks. */
export function tidyText(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .filter(line => line !== '-' && line !== '#')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The readable text of an HTML page: chrome, scripts and forms dropped, headings and list items kept as plain-text markers. */
export function htmlToText(html: string): PageText {
  const rawTitle = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(DROPPED_ELEMENTS, ' ')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n\n# ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_ENDS, '\n')
    .replace(/<[^>]*>/g, '');
  const title = rawTitle ? tidyText(decodeEntities(rawTitle)).replace(/\n/g, ' ') : '';
  return { title: title || null, text: tidyText(decodeEntities(body)) };
}

/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Strip a block-level element (tag + all its nested content) from the HTML string. */
function stripElement(html: string, tag: string): string {
  const open = new RegExp(`<${tag}[\\s\\S]*?>`, 'gi');
  const close = new RegExp(`<\\/${tag}>`, 'gi');
  let result = html;

  // Replace each opening tag + its matching closing tag by scanning depth.
  let match: RegExpExecArray | null;
  while ((match = open.exec(result)) !== null) {
    const start = match.index;
    let depth = 1;
    let i = start + match[0].length;

    while (i < result.length && depth > 0) {
      if (result.slice(i).match(new RegExp(`^<${tag}[\\s>]`, 'i'))) {
        depth++;
        i++;
        continue;
      }
      if (result.slice(i).match(new RegExp(`^<\\/${tag}>`, 'i'))) {
        depth--;
        if (depth === 0) {
          const end = i + `</${tag}>`.length;
          result = result.slice(0, start) + result.slice(end);
          // Reset the regex search from the same position.
          open.lastIndex = start;
          break;
        }
      }
      i++;
    }
    // If no closing tag found, strip from start to end.
    if (depth > 0) {
      result = result.slice(0, start) + result.slice(start + match[0].length);
      open.lastIndex = start;
    }
  }

  // Belt-and-suspenders: remove any orphaned closing tags.
  result = result.replace(close, '');
  return result;
}

/**
 * Convert an HTML string to clean Markdown-flavoured plain text.
 *
 * Uses only regex — no DOM parser or third-party library.
 * Follows the same byte-level rules as the original Python text.py:
 *   - Removes script/style/nav/footer/header/aside trees.
 *   - Maps headings, bold, italic, links.
 *   - Collapses excess blank lines and decodes HTML entities.
 */
export function cleanHtml(html: string): string {
  if (!html) return '';

  // ─── Strip unwanted block elements ──────────────────────────────────────────
  let text = html;
  for (const tag of ['script', 'style', 'nav', 'footer', 'header', 'aside']) {
    text = stripElement(text, tag);
  }

  // ─── Block headings → Markdown headings ─────────────────────────────────────
  text = text
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

  // ─── Inline formatting ───────────────────────────────────────────────────────
  text = text
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // ─── Links: keep visible text, drop href ────────────────────────────────────
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // ─── Paragraph / line-break handling ────────────────────────────────────────
  text = text
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n');

  // ─── Strip all remaining HTML tags ──────────────────────────────────────────
  text = text.replace(/<[^>]+>/g, '');

  // ─── HTML entity decoding ────────────────────────────────────────────────────
  text = text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&hellip;/gi, '...')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    // Numeric entities: &#NNN; (decimal)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // ─── Normalise whitespace ────────────────────────────────────────────────────
  // Collapse 3+ consecutive blank lines to exactly 2.
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

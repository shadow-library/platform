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

export interface Chunk {
  text: string;
  chunkIdx: number;
}

/**
 * Declaring the constants
 */

const DEFAULT_TARGET_CHARS = 2000;

// Split a long paragraph at the nearest sentence boundary before the limit.
function splitAtSentence(text: string, limit: number): [string, string] {
  const sentenceEnd = /[.!?] /g;
  let lastGoodIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = sentenceEnd.exec(text)) !== null) {
    if (match.index + 1 >= limit) break;
    lastGoodIdx = match.index + 1; // include the punctuation character, exclude the space
  }
  if (lastGoodIdx === 0) return [text.slice(0, limit), text.slice(limit)];
  return [text.slice(0, lastGoodIdx), text.slice(lastGoodIdx).trimStart()];
}

// Split text into chunks at paragraph boundaries (~targetChars each).
// Never splits mid-paragraph unless a single paragraph exceeds targetChars*2,
// in which case split at nearest sentence boundary ('. ' or '! ' or '? ').
// Returns at least one chunk even for empty input.
export function chunkText(text: string, targetChars = DEFAULT_TARGET_CHARS): Chunk[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let current = '';

  for (const para of paragraphs) {
    // A single paragraph that exceeds 2x target — split it first.
    if (para.length > targetChars * 2) {
      // Flush whatever is accumulated.
      if (current.length > 0) {
        chunks.push({ text: current, chunkIdx: chunks.length });
        current = '';
      }
      let remaining = para;
      while (remaining.length > targetChars * 2) {
        const [head, tail] = splitAtSentence(remaining, targetChars);
        chunks.push({ text: head, chunkIdx: chunks.length });
        remaining = tail;
      }
      // Remaining piece is <= 2x target; treat as a normal paragraph from here.
      if (remaining.length > 0) {
        current = remaining;
      }
      continue;
    }

    const candidate = current.length > 0 ? current + '\n\n' + para : para;
    if (candidate.length > targetChars && current.length > 0) {
      // Adding this paragraph would exceed target — flush current and start fresh.
      chunks.push({ text: current, chunkIdx: chunks.length });
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) chunks.push({ text: current, chunkIdx: chunks.length });

  // Guarantee at least one chunk even for empty input.
  if (chunks.length === 0) chunks.push({ text: '', chunkIdx: 0 });

  return chunks;
}

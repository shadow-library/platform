export interface Chunk {
  text: string;
  chunkIdx: number;
}

const DEFAULT_TARGET_CHARS = 2000;

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

/** Chunks at paragraph boundaries, splitting oversized paragraphs at the nearest sentence boundary. */
export function chunkText(text: string, targetChars = DEFAULT_TARGET_CHARS): Chunk[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > targetChars * 2) {
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
      if (remaining.length > 0) {
        current = remaining;
      }
      continue;
    }

    const candidate = current.length > 0 ? current + '\n\n' + para : para;
    if (candidate.length > targetChars && current.length > 0) {
      chunks.push({ text: current, chunkIdx: chunks.length });
      current = para;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) chunks.push({ text: current, chunkIdx: chunks.length });

  if (chunks.length === 0) chunks.push({ text: '', chunkIdx: 0 });

  return chunks;
}

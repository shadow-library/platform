import { countTokens as defaultCountTokens } from '../ai/context/token-budget';

export interface SourceSegment {
  index: number;
  start: number;
  end: number;
  text: string;
}

type TokenCounter = (text: string) => number;

interface Span {
  text: string;
  start: number;
  end: number;
}

const SENTENCE_BOUNDARY = /(?<=[。！？!?.])/;

// Collapsing 3+ newlines to a single blank line guarantees every paragraph boundary is exactly
// '\n\n', which is what lets joining paragraph-level segments with '\n\n' reproduce this text exactly.
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function paragraphsOf(text: string): Span[] {
  if (text.length === 0) return [{ text: '', start: 0, end: 0 }];

  const paragraphs: Span[] = [];
  const boundary = /\n{2,}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text))) {
    paragraphs.push({ text: text.slice(cursor, match.index), start: cursor, end: match.index });
    cursor = match.index + match[0].length;
  }
  paragraphs.push({ text: text.slice(cursor), start: cursor, end: text.length });
  return paragraphs;
}

function hardSplitByTokens(text: string, start: number, maxTokens: number, countTokens: TokenCounter): Span[] {
  if (text.length <= 1 || countTokens(text) <= maxTokens) return [{ text, start, end: start + text.length }];

  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(text.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const cut = Math.max(1, lo);
  const head: Span = { text: text.slice(0, cut), start, end: start + cut };
  return [head, ...hardSplitByTokens(text.slice(cut), start + cut, maxTokens, countTokens)];
}

function splitOversizedParagraph(paragraph: Span, maxTokens: number, countTokens: TokenCounter): Span[] {
  const sentences = paragraph.text.split(SENTENCE_BOUNDARY).filter(sentence => sentence.length > 0);
  if (sentences.length <= 1) return hardSplitByTokens(paragraph.text, paragraph.start, maxTokens, countTokens);

  const chunks: Span[] = [];
  let cursor = paragraph.start;
  let chunkStart = cursor;
  let chunkText = '';

  const flush = () => {
    if (chunkText.length === 0) return;
    chunks.push({ text: chunkText, start: chunkStart, end: chunkStart + chunkText.length });
    chunkText = '';
  };

  for (const sentence of sentences) {
    if (countTokens(sentence) > maxTokens) {
      flush();
      chunks.push(...hardSplitByTokens(sentence, cursor, maxTokens, countTokens));
    } else if (chunkText.length === 0) {
      chunkStart = cursor;
      chunkText = sentence;
    } else if (countTokens(chunkText + sentence) <= maxTokens) {
      chunkText += sentence;
    } else {
      flush();
      chunkStart = cursor;
      chunkText = sentence;
    }
    cursor += sentence.length;
  }
  flush();
  return chunks;
}

/**
 * Packs the original chapter into checkpointed translation units: paragraphs
 * pack greedily up to `maxTokens`, and a paragraph that alone exceeds the budget is split at sentence
 * punctuation (CJK and Latin terminators) or, failing that, hard-cut by binary-searching the token count.
 * Every segment's `start`/`end` are exact offsets into the normalised text with no gap or overlap
 * between consecutive segments, so slicing the normalised text from the first segment's `start` to the
 * last segment's `end` always reproduces the source exactly. Segments that split only at paragraph
 * boundaries also reproduce the source when their `text` is joined with `'\n\n'` — `normalize` collapses
 * every run of 3+ newlines to one blank line, so that separator is always exactly two characters; a
 * paragraph that itself had to be split does not carry that separator between its pieces.
 */
export function segmentSource(text: string, maxTokens: number, countTokens: TokenCounter = defaultCountTokens): SourceSegment[] {
  const normalized = normalize(text);
  const paragraphs = paragraphsOf(normalized);
  const units = paragraphs.flatMap(paragraph => (countTokens(paragraph.text) > maxTokens ? splitOversizedParagraph(paragraph, maxTokens, countTokens) : [paragraph]));

  const segments: SourceSegment[] = [];
  let current: Span | null = null;

  for (const unit of units) {
    if (current === null) {
      current = unit;
      continue;
    }
    const combinedText = normalized.slice(current.start, unit.end);
    if (countTokens(combinedText) <= maxTokens) current = { text: combinedText, start: current.start, end: unit.end };
    else {
      segments.push({ index: segments.length, start: current.start, end: current.end, text: current.text });
      current = unit;
    }
  }
  if (current !== null) segments.push({ index: segments.length, start: current.start, end: current.end, text: current.text });
  if (segments.length === 0) segments.push({ index: 0, start: 0, end: 0, text: '' });

  return segments;
}

export function previousTail(text: string, maxChars = 600): string {
  const normalized = normalize(text);
  const paragraphs = normalized.split(/\n{2,}/).filter(paragraph => paragraph.length > 0);
  if (paragraphs.length === 0) return '';

  const picked: string[] = [paragraphs[paragraphs.length - 1] as string];
  for (let i = paragraphs.length - 2; i >= 0; i--) {
    const paragraph = paragraphs[i] as string;
    const pickedLength = picked.reduce((sum, p) => sum + p.length, 0);
    // Adding one paragraph to n picked ones needs n separators, not n + 1.
    const candidateLength = paragraph.length + pickedLength + 2 * picked.length;
    if (candidateLength > maxChars) break;
    picked.unshift(paragraph);
  }

  const joined = picked.join('\n\n');
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

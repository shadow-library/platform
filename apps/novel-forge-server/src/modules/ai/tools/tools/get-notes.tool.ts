import { z } from 'zod';

import { AUTHOR_BRIEF_TOPIC } from '../../../ledger/ledger-sections';
import { notesParagraphs } from '../../context/novel-chat-context';
import { countTokens } from '../../context/token-budget';
import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  from: z.number().int().min(1).optional(),
  part: z.number().int().min(1).optional(),
  query: z.string().trim().min(1).optional(),
});

const outputSchema = z.string();

export const NOTES_PART_TOKENS = 800;
const PAGE_TOKENS = 3_000;
const TOKENS_BUDGET = 4_500;
// The lookup runner cuts a result at `tokensBudget * 4` characters; a page stays well inside it so the continuation hint always survives.
const PAGE_CHARS = TOKENS_BUDGET * 2;
// js-tiktoken is quadratic in the length of one pre-token, and an unspaced script or a repeated character is a single pre-token: a run
// longer than this is never tokenised, but cut by its UTF-8 length, which bounds its token count from above.
const TOKENISED_RUN_CHARS = 32;

interface SizedText {
  text: string;
  tokens: number;
}

interface NotesPart extends SizedText {
  paragraph: number;
  part: number;
  parts: number;
}

function utf8Length(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function byteBoundedPieces(run: string, maxBytes: number): SizedText[] {
  const pieces: SizedText[] = [];
  let text = '';
  let bytes = 0;
  for (const char of run) {
    const size = utf8Length(char);
    if (text && bytes + size > maxBytes) {
      pieces.push({ text, tokens: bytes });
      text = '';
      bytes = 0;
    }
    text += char;
    bytes += size;
  }
  if (text) pieces.push({ text, tokens: bytes });
  return pieces;
}

function sizedRuns(text: string, maxTokens: number): SizedText[] {
  return (text.match(/\s*\S+/g) ?? [text]).flatMap(run => (run.length <= TOKENISED_RUN_CHARS ? [{ text: run, tokens: countTokens(run) }] : byteBoundedPieces(run, maxTokens)));
}

/** Whole words while they fit, then a long run cut by its length; the parts rejoin to the paragraph exactly. */
function sizedParts(text: string, maxTokens: number): SizedText[] {
  const parts: SizedText[] = [];
  let current: SizedText = { text: '', tokens: 0 };
  for (const run of sizedRuns(text, maxTokens)) {
    if (current.text && current.tokens + run.tokens > maxTokens) {
      parts.push(current);
      current = { text: '', tokens: 0 };
    }
    current = { text: current.text + run.text, tokens: current.tokens + run.tokens };
  }
  if (current.text) parts.push(current);
  return parts;
}

export function splitNotesParagraph(text: string, maxTokens: number = NOTES_PART_TOKENS): string[] {
  return sizedParts(text, maxTokens).map(part => part.text);
}

function notesParts(paragraphs: readonly string[]): NotesPart[] {
  return paragraphs.flatMap((paragraph, index) => {
    const parts = sizedParts(paragraph, NOTES_PART_TOKENS);
    return parts.map((part, at) => ({ paragraph: index + 1, part: at + 1, parts: parts.length, ...part }));
  });
}

function partLabel(part: NotesPart): string {
  return part.parts === 1 ? `¶${part.paragraph}` : `¶${part.paragraph}.${part.part}`;
}

function continueAt(part: NotesPart): string {
  return part.part === 1 ? `from: ${part.paragraph}` : `from: ${part.paragraph}, part: ${part.part}`;
}

export const getNotesTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    "Read the author's own notes verbatim, numbered by paragraph (a long paragraph comes in parts, ¶3.2). `from` and `part` say where to start; `query` keeps only the paragraphs containing that text. Use before quoting, organising or critiquing them.",
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const entry = await ctx.db.query.decisionLedgerEntries.findFirst({
      where: (ledger, { and, eq, isNull }) => and(eq(ledger.projectId, ctx.projectId), eq(ledger.topic, AUTHOR_BRIEF_TOPIC), isNull(ledger.supersededAt)),
      orderBy: (ledger, { desc }) => desc(ledger.createdAt),
    });
    const paragraphs = notesParagraphs(entry?.statement ?? '');
    if (paragraphs.length === 0) return 'The author has not stored any notes.';
    const from = parsed.from ?? 1;
    if (from > paragraphs.length) return `The author's notes have ${paragraphs.length} paragraphs; there is no paragraph ${from}.`;

    const query = parsed.query?.toLowerCase();
    const wanted = new Set(paragraphs.flatMap((paragraph, index) => (index + 1 >= from && (!query || paragraph.toLowerCase().includes(query)) ? [index + 1] : [])));
    const startPart = parsed.part ?? 1;
    const matching = notesParts(paragraphs).filter(part => wanted.has(part.paragraph) && (part.paragraph > from || part.part >= startPart));
    if (matching.length === 0) return `Nothing in the author's ${paragraphs.length} paragraphs matches from there on.`;

    const lines: string[] = [];
    let tokens = 0;
    let chars = 0;
    for (const part of matching) {
      const label = `[${partLabel(part)}] `;
      const line = `${label}${part.text}`;
      const cost = countTokens(label) + part.tokens;
      if (lines.length > 0 && (tokens + cost > PAGE_TOKENS || chars + line.length > PAGE_CHARS)) break;
      lines.push(line);
      tokens += cost;
      chars += line.length;
    }
    const rest = matching[lines.length];
    const more = rest ? `\n\n(${matching.length - lines.length} more — continue with ${continueAt(rest)})` : '';
    return `The author's notes (${paragraphs.length} paragraphs):\n\n${lines.join('\n\n')}${more}`;
  },
  inputSchema,
  maxCallsPerRun: 4,
  name: 'get_notes',
  outputSchema,
  tokensBudget: TOKENS_BUDGET,
};

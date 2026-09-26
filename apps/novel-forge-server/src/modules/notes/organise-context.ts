import { type Ledger } from '@server/database';

import { notesParagraphs } from '../ai/context/novel-chat-context';
import { renderSection } from '../ai/context/sections';
import { countWords } from '../eval/deterministic-metrics';
import { AUTHOR_BRIEF_TOPIC, ledgerSection } from '../ledger/ledger-sections';

export interface OrganiseContext {
  stableContext: string;
  /** The author's own words, apart from the ledger so the hard line screens them as the author's rather than as derived context. */
  authorNotes: string;
  volatileContext: string;
}

/** A run of whole paragraphs one model call organises, numbered as `get_notes` numbers them. */
export interface OrganisePass {
  first: number;
  last: number;
  paragraphs: string[];
}

/**
 * The gateway ends a call at five minutes, and a pass over the longest notes ran four to five, its length driven by the answer it writes
 * about as much as by what it reads. A pass over at most this many words writes a fraction of that answer.
 */
export const ORGANISE_PASS_WORDS = 3_000;

/** What earlier passes over the same notes made, so a later pass names the same things the same way and asks nothing twice. */
export interface EarlierParts {
  reading?: string;
  /** `name (type)` of each record. */
  records: string[];
  /** `section/slug` of each page. */
  pages: string[];
  questions: string[];
}

const ORGANISE_REQUEST = "Organise the author's notes above into a starting Story Bible.";
const NO_EARLIER_PARTS: EarlierParts = { records: [], pages: [], questions: [] };

export function notesOf(ledger: Pick<Ledger.Entry, 'topic' | 'statement'>[]): string {
  return ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '';
}

/** Consecutive whole paragraphs up to the word limit; a paragraph longer than the limit is a pass of its own rather than cut. */
export function organisePasses(notes: string, maxWords: number = ORGANISE_PASS_WORDS): OrganisePass[] {
  const passes: OrganisePass[] = [];
  let words = 0;
  notesParagraphs(notes).forEach((paragraph, index) => {
    const size = countWords(paragraph);
    const current = passes.at(-1);
    if (current && words + size <= maxWords) {
      current.paragraphs.push(paragraph);
      current.last = index + 1;
      words += size;
      return;
    }
    passes.push({ first: index + 1, last: index + 1, paragraphs: [paragraph] });
    words = size;
  });
  return passes;
}

function numbered(pass: OrganisePass): string {
  return pass.paragraphs.map((paragraph, index) => `[¶${pass.first + index}] ${paragraph}`).join('\n\n');
}

function listed(label: string, items: readonly string[]): string {
  return items.length > 0 ? ` ${label}: ${items.join('; ')}.` : '';
}

function passRequest(pass: OrganisePass, passes: number, paragraphs: number, earlier: EarlierParts): string {
  if (passes === 1) return ORGANISE_REQUEST;
  const part = `The notes are long, so they come in ${passes} parts; this is ¶${pass.first}–¶${pass.last} of ${paragraphs}. Organise only these paragraphs.`;
  const reading = earlier.reading ? ` How the earlier parts read: ${earlier.reading}` : '';
  const made = [
    listed('Records named in earlier parts, to use under the same name and type', earlier.records),
    listed('Pages earlier parts wrote, to add to at the same address', earlier.pages),
    listed('Questions earlier parts already asked, not to ask again', earlier.questions),
  ].join('');
  return `${ORGANISE_REQUEST} ${part}${reading}${made}`;
}

/** What the passes so far made, as the next pass is told it. */
export function earlierParts(
  outputs: readonly { reading: string; records: { name: string; type: string }[]; pages: { section: string; slug: string }[]; questions: { question: string }[] }[],
): EarlierParts {
  const unique = (items: string[]) => [...new Set(items.map(item => item.trim()).filter(Boolean))];
  return {
    reading: outputs[0]?.reading.trim() || undefined,
    records: unique(outputs.flatMap(output => output.records.map(record => `${record.name.trim()} (${record.type})`))),
    pages: unique(outputs.flatMap(output => output.pages.map(page => `${page.section}/${page.slug}`))),
    questions: unique(outputs.flatMap(output => output.questions.map(item => item.question))),
  };
}

/** The notes ride numbered by paragraph, beside the ledger whose decisions and do-not-propose list bind the pass. */
export function organiseContext(ledger: Ledger.Entry[], pass?: OrganisePass, passes = 1, earlier: EarlierParts = NO_EARLIER_PARTS): OrganiseContext {
  const notes = notesOf(ledger);
  const whole = pass ?? { first: 1, last: notesParagraphs(notes).length, paragraphs: notesParagraphs(notes) };
  return {
    stableContext: ledgerSection(ledger).rendered,
    authorNotes: renderSection('author_brief', numbered(whole)),
    volatileContext: passRequest(whole, passes, notesParagraphs(notes).length, earlier),
  };
}

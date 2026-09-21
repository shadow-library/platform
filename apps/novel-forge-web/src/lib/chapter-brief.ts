import { type ChangeOp } from './proposals';

export interface BriefSection {
  heading: string | null;
  paragraphs: string[];
  items: string[];
}

export interface EndingContractView {
  hookType?: string;
  emotionalBeat?: string;
  openQuestion?: string;
  handoffState?: string;
  mustNotResolve: string[];
}

interface DraftLike {
  chapter: number;
  status: string;
}

interface ProposalLike {
  id: string;
  status: string;
  changeSet: ChangeOp[];
  opResults?: Record<string, unknown>[] | null;
}

const HEADING = /^([A-Z][\p{L}’' /-]{0,38}):\s*(.*)$/u;
// A label with text after it is a heading only when it names a brief section: "Orrin: bribes the ferryman" is a beat.
const SECTION_LABELS = new Set([
  'purpose',
  'objective',
  'goal',
  'beats',
  'events',
  'key events',
  'ending',
  'hook',
  'pov',
  'tone',
  'mood',
  'setting',
  'stakes',
  'conflict',
  'outcome',
  'handoff',
  'continuity',
  'summary',
  'cast',
  'characters',
  'theme',
  'notes',
]);
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const CONTINUITY_LINE = /^(?:\[[A-Z ]+\]|Handoff beat:)/;
const MAX_HEADING_WORDS = 4;

function headingOf(line: string): { heading: string; rest: string } | null {
  const match = HEADING.exec(line.trim());
  if (!match?.[1] || match[1].trim().split(/\s+/).length > MAX_HEADING_WORDS) return null;
  const heading = match[1].trim();
  const rest = (match[2] ?? '').trim();
  if (rest && !SECTION_LABELS.has(heading.toLowerCase())) return null;
  return { heading, rest };
}

function emptySection(heading: string | null): BriefSection {
  return { heading, paragraphs: [], items: [] };
}

function hasContent(section: BriefSection): boolean {
  return section.paragraphs.length > 0 || section.items.length > 0;
}

/** An outlined brief is its objective on the first line and one event per line after it, with no headings of its own. */
function parseOutlineLines(lines: string[]): BriefSection[] {
  const [objective = '', ...rest] = lines;
  const events = rest.filter(line => !CONTINUITY_LINE.test(line));
  const notes = rest.filter(line => CONTINUITY_LINE.test(line));
  const sections: BriefSection[] = [{ heading: 'Objective', paragraphs: [objective], items: [] }];
  if (events.length > 0) sections.push({ heading: 'Beats', paragraphs: [], items: events.map(line => BULLET.exec(line)?.[1] ?? line) });
  if (notes.length > 0) sections.push({ heading: 'Continuity', paragraphs: [], items: notes });
  return sections;
}

/**
 * Reads a brief body into labelled sections: "Purpose: …" starts a section with inline text, "Beats:" one whose
 * list follows, and blank lines split paragraphs. A body with no labels falls back to the outliner's
 * objective-then-events shape when it is one line per entry, and to plain paragraphs otherwise.
 */
export function parseBriefBody(body: string): BriefSection[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const filled = lines.map(line => line.trim()).filter(Boolean);
  if (filled.length === 0) return [];

  const labelled = filled.some(line => headingOf(line) && !CONTINUITY_LINE.test(line));
  const hasBlankLines = filled.length < lines.length;
  if (!labelled && !hasBlankLines && filled.length > 1) return parseOutlineLines(filled);

  const sections: BriefSection[] = [];
  let current = emptySection(null);
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) current.paragraphs.push(paragraph.join(' '));
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = labelled ? headingOf(line) : null;
    if (heading) {
      flush();
      if (hasContent(current) || current.heading) sections.push(current);
      current = emptySection(heading.heading);
      if (heading.rest) paragraph.push(heading.rest);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet?.[1]) {
      flush();
      current.items.push(bullet[1]);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  sections.push(current);
  return sections.filter(hasContent);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function endingContractOf(value: unknown): EndingContractView | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const view: EndingContractView = {
    hookType: text(record.hookType)?.replace(/_/g, ' '),
    emotionalBeat: text(record.emotionalBeat),
    openQuestion: text(record.openQuestion),
    handoffState: text(record.handoffState),
    mustNotResolve: Array.isArray(record.mustNotResolve) ? record.mustNotResolve.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [],
  };
  const empty = !view.hookType && !view.emotionalBeat && !view.openQuestion && !view.handoffState && view.mustNotResolve.length === 0;
  return empty ? null : view;
}

/** The chapters whose brief this applied proposal actually rewrote — the ones worth regenerating from the new plan. */
export function appliedBriefChapters(proposal: ProposalLike): number[] {
  if (proposal.status !== 'applied') return [];
  const results = proposal.opResults ?? [];
  const chapters = proposal.changeSet.flatMap((op, index) => {
    if (op.op !== 'brief.update' || typeof op.chapter !== 'number') return [];
    const result = results.find(entry => entry.index === index);
    return result && result.status !== 'applied' ? [] : [op.chapter];
  });
  return [...new Set(chapters)].sort((a, b) => a - b);
}

/** Of the chapters a plan change touched, those with prose to replace: drafted and not yet finalized. */
export function regenerableChapters(chapters: readonly number[], drafts: readonly DraftLike[]): number[] {
  return chapters.filter(chapter => drafts.some(draft => draft.chapter === chapter && draft.status !== 'final'));
}

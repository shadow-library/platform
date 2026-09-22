import { type BriefResponse, type HookType, type UpdateBriefBody } from './apis';
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
const HANDOFF_PREFIX = 'Handoff beat: ';
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

function briefLines(body: string): { lines: string[]; filled: string[]; labelled: boolean; hasBlankLines: boolean } {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const filled = lines.map(line => line.trim()).filter(Boolean);
  const labelled = filled.some(line => headingOf(line) && !CONTINUITY_LINE.test(line));
  return { lines, filled, labelled, hasBlankLines: filled.length < lines.length };
}

/**
 * Reads a brief body into labelled sections: "Purpose: …" starts a section with inline text, "Beats:" one whose
 * list follows, and blank lines split paragraphs. A body with no labels falls back to the outliner's
 * objective-then-events shape when it is one line per entry, and to plain paragraphs otherwise.
 */
export function parseBriefBody(body: string): BriefSection[] {
  const { lines, filled, labelled, hasBlankLines } = briefLines(body);
  if (filled.length === 0) return [];
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

export interface BriefListItem {
  id: string;
  text: string;
}

export interface BriefEditSection {
  id: string;
  heading: string | null;
  text: string;
  items: BriefListItem[];
  layout: 'text' | 'list' | 'both';
}

export type BriefEditModel = { shape: 'outline'; objective: string; beats: BriefListItem[]; continuity: BriefListItem[] } | { shape: 'labelled'; sections: BriefEditSection[] };

const HANDOFF_PREFIX_ANY_CASE = /^handoff beat:\s*/i;
const UNLABELLED_SECTION_HEADING = 'Notes';

export function briefListItem(text = ''): BriefListItem {
  return { id: crypto.randomUUID(), text };
}

function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim();
}

function filledLines(items: readonly BriefListItem[]): string[] {
  return items.map(item => oneLine(item.text)).filter(Boolean);
}

/** A beat the parser would read as a heading, a continuity note or a numbered entry keeps its text only behind a bullet, which the outline parser strips. */
function outlineBeatLine(beat: string): string {
  return headingOf(beat) || CONTINUITY_LINE.test(beat) || BULLET.test(beat) ? `- ${beat}` : beat;
}

function continuityLine(note: string): string {
  return /^\[[A-Z ]+\]/.test(note) ? note : `${HANDOFF_PREFIX}${note.replace(HANDOFF_PREFIX_ANY_CASE, '')}`;
}

export function toEditModel(body: string): BriefEditModel {
  const { filled, labelled, hasBlankLines } = briefLines(body);
  if (filled.length === 0) return { shape: 'outline', objective: '', beats: [], continuity: [] };
  if (!labelled && !hasBlankLines && filled.length > 1) {
    const [objective = '', ...rest] = filled;
    const beats = rest.filter(line => !CONTINUITY_LINE.test(line)).map(line => briefListItem(BULLET.exec(line)?.[1] ?? line));
    const continuity = rest.filter(line => CONTINUITY_LINE.test(line)).map(line => briefListItem(line.replace(HANDOFF_PREFIX_ANY_CASE, '')));
    return { shape: 'outline', objective, beats, continuity };
  }
  const sections = parseBriefBody(body).map((section): BriefEditSection => ({
    id: crypto.randomUUID(),
    heading: section.heading,
    text: section.paragraphs.join('\n\n'),
    items: section.items.map(item => briefListItem(item)),
    layout: section.items.length === 0 ? 'text' : section.paragraphs.length === 0 ? 'list' : 'both',
  }));
  return { shape: 'labelled', sections };
}

function serializeSection(section: BriefEditSection): string {
  const paragraphs = section.text
    .split(/\n\s*\n/)
    .map(oneLine)
    .filter(Boolean);
  const items = filledLines(section.items).map(item => `- ${item}`);
  if (paragraphs.length === 0 && items.length === 0) return '';
  const prose = paragraphs.join('\n\n');
  // Unlabelled lines with no blank line between them would read back as an outline, so prose and list stay a paragraph apart,
  // and a bare list takes a heading of its own.
  const heading = section.heading ?? (prose ? null : UNLABELLED_SECTION_HEADING);
  if (heading === null) return [prose, items.join('\n')].filter(Boolean).join('\n\n');
  if (prose && SECTION_LABELS.has(heading.toLowerCase())) return [`${heading}: ${prose}`, ...items].join('\n');
  return [`${heading}:`, ...[prose, ...items].filter(Boolean)].join('\n');
}

/**
 * Writes the edited sections back as a brief body. An outline stays one entry per line — objective, beats, then continuity — the
 * shape the outliner stores and the writer reads; continuity notes carry the hand-off prefix so they still read as continuity.
 */
export function serializeBriefSections(model: BriefEditModel): string {
  if (model.shape === 'labelled') return model.sections.map(serializeSection).filter(Boolean).join('\n\n');
  return [oneLine(model.objective), ...filledLines(model.beats).map(outlineBeatLine), ...filledLines(model.continuity).map(continuityLine)].filter(Boolean).join('\n');
}

/** Why the outline cannot be written as one entry per line right now, or `null` when it can. */
export function outlineObjectiveProblem(model: BriefEditModel): string | null {
  if (model.shape !== 'outline') return null;
  const objective = oneLine(model.objective);
  const hasEntries = filledLines(model.beats).length > 0 || filledLines(model.continuity).length > 0;
  if (!objective) return hasEntries ? 'Add an objective — without one, the first beat would be read as the objective.' : null;
  if (headingOf(objective)) return 'Reword the objective so it doesn’t start with a label like “Setting:” — it would be read as a section heading.';
  return null;
}

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  cliffhanger: 'cliffhanger',
  revelation: 'revelation',
  quiet_dread: 'quiet dread',
  promise: 'promise',
  turn: 'turn',
  closure_with_momentum: 'closure with momentum',
  earned_rest: 'earned rest',
};

export const HOOK_TYPES = Object.keys(HOOK_TYPE_LABELS) as HookType[];

export interface EndingDraft {
  hookType: HookType | '';
  emotionalBeat: string;
  openQuestion: string;
  handoffState: string;
  mustNotResolve: string[];
}

export interface BriefDraft {
  title: string;
  chapterPurpose: string;
  pov: string;
  guidance: string;
  ending: EndingDraft;
  body: BriefEditModel;
  /** The body as free text while the plain-text editor is open; `null` while it is edited as fields. */
  plainBody: string | null;
}

export type BriefSave = { kind: 'unchanged' } | { kind: 'invalid'; problems: string[]; missing: string[]; endingMissing: string[] } | { kind: 'ready'; update: UpdateBriefBody };

type BriefSource = Pick<BriefResponse, 'title' | 'body' | 'chapterPurpose' | 'pov' | 'guidance' | 'endingContract'>;

function isHookType(value: unknown): value is HookType {
  return typeof value === 'string' && (HOOK_TYPES as readonly string[]).includes(value);
}

function endingDraftOf(value: unknown): EndingDraft {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const field = (key: string): string => (typeof record[key] === 'string' ? record[key] : '');
  return {
    hookType: isHookType(record.hookType) ? record.hookType : '',
    emotionalBeat: field('emotionalBeat'),
    openQuestion: field('openQuestion'),
    handoffState: field('handoffState'),
    mustNotResolve: Array.isArray(record.mustNotResolve) ? record.mustNotResolve.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [],
  };
}

export function briefDraftOf(brief: BriefSource): BriefDraft {
  return {
    title: brief.title ?? '',
    chapterPurpose: brief.chapterPurpose ?? '',
    pov: brief.pov ?? '',
    guidance: brief.guidance ?? '',
    ending: endingDraftOf(brief.endingContract),
    body: toEditModel(brief.body),
    plainBody: null,
  };
}

export function briefBodyText(draft: BriefDraft): string {
  return draft.plainBody ?? serializeBriefSections(draft.body);
}

function normalizedEnding(ending: EndingDraft): EndingDraft {
  return {
    hookType: ending.hookType,
    emotionalBeat: ending.emotionalBeat.trim(),
    openQuestion: ending.openQuestion.trim(),
    handoffState: ending.handoffState.trim(),
    mustNotResolve: ending.mustNotResolve.map(item => item.trim()).filter(Boolean),
  };
}

function sameEnding(a: EndingDraft, b: EndingDraft): boolean {
  return (
    a.hookType === b.hookType &&
    a.emotionalBeat === b.emotionalBeat &&
    a.openQuestion === b.openQuestion &&
    a.handoffState === b.handoffState &&
    a.mustNotResolve.join('\n') === b.mustNotResolve.join('\n')
  );
}

function missingEndingFields(ending: EndingDraft): string[] {
  const required: [string, string][] = [
    ['Hook', ending.hookType],
    ['Feeling', ending.emotionalBeat],
    ['Open question', ending.openQuestion],
    ['Hands off', ending.handoffState],
  ];
  return required.flatMap(([label, value]) => (value ? [] : [label]));
}

function isEmptyEnding(ending: EndingDraft): boolean {
  return missingEndingFields(ending).length === 4 && ending.mustNotResolve.length === 0;
}

/**
 * Diffs the draft against `brief`, the version editing started from, and sends only the fields the author changed. `body` is
 * required by the endpoint, so an unedited body is sent as `currentBody` — the latest stored text — which keeps it byte-identical
 * and never reverts a body edited elsewhere while the editor was open.
 */
export function briefSaveOf(brief: BriefSource, draft: BriefDraft, currentBody: string = brief.body): BriefSave {
  const original = briefDraftOf(brief);
  const update: Omit<UpdateBriefBody, 'body'> = {};
  const title = draft.title.trim();
  if (title !== original.title.trim()) update.title = title;
  for (const key of ['chapterPurpose', 'pov', 'guidance'] as const) {
    const value = draft[key].trim();
    if (value !== original[key].trim()) update[key] = value;
  }

  const ending = normalizedEnding(draft.ending);
  const originalEnding = normalizedEnding(original.ending);
  const endingChanged = !sameEnding(ending, originalEnding) && !(isEmptyEnding(ending) && isEmptyEnding(originalEnding));
  const endingMissing = endingChanged && !isEmptyEnding(ending) ? missingEndingFields(ending) : [];
  if (endingChanged && isEmptyEnding(ending)) update.endingContract = null;
  else if (endingChanged && endingMissing.length === 0 && isHookType(ending.hookType)) update.endingContract = { ...ending, hookType: ending.hookType };

  const bodyText = briefBodyText(draft);
  const bodyChanged = bodyText.trim() !== serializeBriefSections(original.body).trim();
  if (Object.keys(update).length === 0 && !bodyChanged && !endingChanged) return { kind: 'unchanged' };

  const objectiveProblem = bodyChanged && draft.plainBody === null ? outlineObjectiveProblem(draft.body) : null;
  const missing = [...(update.title === '' ? ['Title'] : []), ...endingMissing];
  const problems = [...(missing.length > 0 ? [`Fill in ${missing.join(', ')} to save.`] : []), ...(objectiveProblem ? [objectiveProblem] : [])];
  if (problems.length > 0) return { kind: 'invalid', problems, missing, endingMissing };
  return { kind: 'ready', update: { ...update, body: bodyChanged ? bodyText : currentBody } };
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

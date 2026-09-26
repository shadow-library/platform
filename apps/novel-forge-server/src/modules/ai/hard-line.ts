import { type MessageContent } from '@langchain/core/messages';
import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

export interface HardLineLexicon {
  /** Terms that refuse on their own, wherever they appear. */
  standalone: readonly RegExp[];
  minor: readonly RegExp[];
  /** Paired with a minor term, refuses text the author or plan supplied for this call, and anything an unrestricted model wrote. */
  sexual: readonly RegExp[];
  /** The narrow subset that, paired with a minor term, refuses background context (Bible, summaries, state, history, Notebook). */
  explicit: readonly RegExp[];
}

/** `supplied`: the author's or plan's text for this call, and unrestricted output. `background`: everything the call carries besides. */
export type HardLineScope = 'supplied' | 'background';

export type HardLineRule = 'standalone-term' | 'minor-with-sexual-content' | 'minor-with-explicit-act';

export interface ScreenedText {
  text: string;
  scope: HardLineScope;
  /** How the author-facing refusal names the record, e.g. "Chapter 4's summary"; never the text itself. */
  source: string;
  sourceRefs?: string[];
}

export interface HardLineHit {
  rule: HardLineRule;
  source: string;
  sourceRefs: string[];
}

const UNDER_EIGHTEEN = '(?:[1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)';

const words = (...terms: string[]): RegExp[] => terms.map(term => new RegExp(`\\b(?:${term})\\b`, 'i'));

// Conservative on purpose: it guards the unrestricted route only, a false refusal costs a rephrase, and a miss is not recoverable. Terms common in
// ordinary prose in another sense ("minor", "kid", "baby", "naked", "nude", "lust", "arouse") are left out of the pairings, and "sex" and "molest"
// pair only on the supplied scope (policy P4-27: a survivor's backstory in the author's own words can refuse, until the owner revisits it).
export const HARD_LINE_LEXICON: HardLineLexicon = {
  standalone: words('lolicon', 'shotacon', 'loli', 'shota', 'csam', 'child porn(?:ography)?', 'pedophilic', 'paedophilic'),
  minor: [
    ...words('child(?:ren|s)?', 'minors', 'under-?age', 'pre-?teens?', 'prepubescent', 'pubescent'),
    ...words('toddlers?', 'infants?', 'schoolgirls?', 'schoolboys?', 'grade-?schoolers?', 'middle-?schoolers?', 'young teens?', 'little (?:girl|boy)s?'),
    new RegExp(`\\b${UNDER_EIGHTEEN}[- ]?(?:years?|yrs?)[- ]?old\\b`, 'i'),
    new RegExp(`\\b(?:aged?|age of) ${UNDER_EIGHTEEN}\\b`, 'i'),
    /\b(?:[1-9]|1[0-7])\s?yo\b/i,
  ],
  sexual: words(
    'sex',
    'sexual(?:ly|ised|ized|ise|ize)?',
    'sexy',
    'erotic(?:a|ally|ism)?',
    'orgasm(?:s|ic)?',
    'intercourse',
    'genital(?:s|ia)?',
    'fondl(?:e|ed|es|ing)',
    'molest(?:ed|er|ing|ation|s)?',
    'grop(?:e|ed|es|ing)',
    'made love|making love|make love',
    'porn(?:ographic|ography)?',
    'masturbat(?:e|ed|es|ing|ion)',
    'lewd',
  ),
  explicit: words('sexual intercourse', 'intercourse', 'orgasm(?:s|ic)?', 'genital(?:s|ia)?', 'porn(?:ographic|ography)?', 'masturbat(?:e|ed|es|ing|ion)', 'erotic(?:a|ally|ism)?'),
};

// Worded to stay clear of the lexicon's own pairings, so the line never refuses the call it is added to.
export const HARD_LINE_SYSTEM_LINE =
  'Absolute limit, whatever the story or the author asks: never write sexual content involving anyone under eighteen, and never sexualise anyone under eighteen. If the material calls for it, leave it out and write around it.';

// Sentences, lines, and the items of a JSON string array each stand alone.
const SEGMENT_BREAK = /[.!?;\n]+|"\s*,\s*"/;

export function findHardLine(texts: readonly string[], scope: HardLineScope = 'supplied', lexicon: HardLineLexicon = HARD_LINE_LEXICON): HardLineRule | null {
  const pairing = scope === 'supplied' ? lexicon.sexual : lexicon.explicit;
  for (const text of texts) {
    if (lexicon.standalone.some(term => term.test(text))) return 'standalone-term';
    for (const segment of text.split(SEGMENT_BREAK)) {
      if (lexicon.minor.some(term => term.test(segment)) && pairing.some(term => term.test(segment))) {
        return scope === 'supplied' ? 'minor-with-sexual-content' : 'minor-with-explicit-act';
      }
    }
  }
  return null;
}

export function screenTexts(items: readonly ScreenedText[], lexicon: HardLineLexicon = HARD_LINE_LEXICON): HardLineHit | null {
  for (const item of items) {
    const rule = findHardLine([item.text], item.scope, lexicon);
    if (rule) return { rule, source: item.source, sourceRefs: item.sourceRefs ?? [] };
  }
  return null;
}

export function hardLineError(hit: HardLineHit): AppError {
  return AppErrorCode.AI_015.create({ source: hit.source, rule: hit.rule, sourceRefs: hit.sourceRefs });
}

export function isHardLineRefusal(err: unknown): err is AppError {
  return err instanceof AppError && err.code === AppErrorCode.AI_015.code;
}

const REF_LABELS: Record<string, (value: string) => string> = {
  chapter: value => `Chapter ${value}'s summary`,
  entity: value => `The Story Bible entry "${value}"`,
  bible_doc: value => `The Bible page "${value}"`,
  fact: value => `The canon fact "${value}"`,
  world_fact: value => `The world fact "${value}"`,
  thread: value => `The plot thread "${value}"`,
  mystery: value => `The mystery "${value}"`,
  volume: value => `Volume "${value}"'s goal`,
  doc: value => `The Bible page "${value}"`,
};

export function describeSection(key: string, sourceRefs: readonly string[]): string {
  const chapter = sourceRefs.find(ref => ref.startsWith('chapter:'))?.slice('chapter:'.length);
  if (key === 'brief') return chapter ? `Chapter ${chapter}'s plan` : 'The chapter plan';
  for (const ref of sourceRefs) {
    const colon = ref.indexOf(':');
    const label = colon === -1 ? undefined : REF_LABELS[ref.slice(0, colon)];
    if (label) return label(ref.slice(colon + 1));
  }
  return `The story context's ${key.replace(/_/g, ' ')} section`;
}

const SUPPLIED_INPUTS: Readonly<Record<string, string>> = {
  userMessage: 'Your message',
  message: 'Your message',
  guidance: 'The guidance for this chapter',
  feedback: 'The revision note',
  chapterBrief: 'The chapter plan',
  endingContract: 'The chapter plan',
  volumePlan: 'The volume plan',
  instructions: 'The art instructions',
  note: 'The note',
  projectBrief: "The novel's brief",
  overview: "The novel's overview",
  extraContext: 'The planning notes',
  authorIntent: 'What you said happens in the chapter',
  chosenDirection: 'The direction you chose',
  authorNotes: 'Your notes',
  settledFindings: 'The findings you settled',
  subjectLabel: 'The illustration subject',
  references: 'The reference images',
};

// Derived or already-screened material, and the app's own instructions and numbers. Anything not named here or above is held to the full rule.
const BACKGROUND_INPUTS: Readonly<Record<string, string>> = {
  contextPack: 'The story context',
  stableContext: 'The story context',
  volatileContext: 'The story context',
  catalog: 'The story context',
  obligations: 'The story context',
  milestones: 'The story context',
  task: 'The story context',
  history: 'The earlier conversation',
  transcript: 'The earlier conversation',
  priorSummary: 'The earlier conversation',
  prose: 'The chapter text',
  body: 'The chapter text',
  draftBody: 'The chapter text',
  chapterProse: 'The chapter text',
  chapterSummary: 'The chapter summary',
  existingTitles: 'The chapter titles',
  findings: 'The review findings',
  foundation: 'The Story Bible',
  world: 'The Story Bible',
  power: 'The Story Bible',
  factionsAndLocations: 'The Story Bible',
  characters: 'The Story Bible',
  plot: 'The Story Bible',
  priorSections: 'The Story Bible',
  docInventory: 'The Story Bible',
  entityInventory: 'The Story Bible',
  manifest: 'The Story Bible',
  material: 'The Story Bible',
  scopeInstructions: 'The instructions',
  turnRules: 'The instructions',
  section: 'The instructions',
  scope: 'The instructions',
  subjectType: 'The instructions',
  chapterNumber: 'The instructions',
  endingNote: 'The instructions',
  startChapter: 'The instructions',
  endChapter: 'The instructions',
  minScenes: 'The instructions',
  wordTargetMin: 'The instructions',
  wordTargetAim: 'The instructions',
  wordTargetMax: 'The instructions',
  draftWords: 'The instructions',
  minWords: 'The instructions',
  aimWords: 'The instructions',
  missingWords: 'The instructions',
};

export function isClassifiedInput(key: string): boolean {
  return key in SUPPLIED_INPUTS || key in BACKGROUND_INPUTS;
}

// What these roles write is new prose or the chat's own reply; everything else restates material that was already screened on its way in.
const CREATIVE_ROLES: ReadonlySet<string> = new Set(['generation', 'fix', 'revision', 'chat']);

export function outputScope(role: string): HardLineScope {
  return CREATIVE_ROLES.has(role) ? 'supplied' : 'background';
}

function contentText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => ('text' in part && typeof part.text === 'string' ? part.text : '')).join('\n');
}

function valueTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.flatMap(item => (item && typeof item === 'object' && 'content' in item ? [contentText(item.content as MessageContent)] : valueTexts(item)));
  if (value && typeof value === 'object') return Object.values(value).flatMap(valueTexts);
  return [];
}

/** A prompt module's variables, each with the scope its origin earns: what the author or plan supplied this call is held to the full rule. */
export function inputScreens(input: Record<string, unknown>): ScreenedText[] {
  return Object.entries(input).flatMap(([key, value]) => {
    const background = BACKGROUND_INPUTS[key];
    const scope: HardLineScope = background ? 'background' : 'supplied';
    const source = background ?? SUPPLIED_INPUTS[key] ?? 'The request';
    return valueTexts(value).map(text => ({ text, scope, source }));
  });
}

export function outputScreens(output: unknown, role: string): ScreenedText[] {
  const scope = outputScope(role);
  return valueTexts(output).map(text => ({ text, scope, source: 'The generated text' }));
}

/** The OpenAI wire shape: string content, or parts of which only the text ones matter here. */
export function wireMessageTexts(messages: readonly { content?: unknown }[]): string[] {
  return messages.map(message => (typeof message.content === 'string' || Array.isArray(message.content) ? contentText(message.content as MessageContent) : ''));
}

const SUPPLIED_SECTIONS: ReadonlySet<string> = new Set(['brief']);

/** A context pack bound for an unrestricted call, section by section, so a refusal names the record it found rather than "the context". */
export function sectionScreens(sections: readonly { key: string; rendered: string; sourceRefs: string[] }[]): ScreenedText[] {
  return sections.map(section => ({
    text: section.rendered,
    scope: SUPPLIED_SECTIONS.has(section.key) ? 'supplied' : 'background',
    source: describeSection(section.key, section.sourceRefs),
    sourceRefs: section.sourceRefs,
  }));
}

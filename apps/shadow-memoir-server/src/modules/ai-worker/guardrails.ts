/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type DraftSuggestion, type InferenceDraft } from './ai-worker.types';

/**
 * Defining types
 */

export type GuardrailViolation = 'verbatim_quote' | 'identity_assertion' | 'shame_copy' | 'mechanic_mutation';

export interface GuardrailInput {
  queryText: string;
  /** Every most-sensitive free-text value the read assembly actually put in front of the model — the no-verbatim-quote check is a comparison against these exact strings, not a heuristic. */
  sensitiveSources: string[];
  allowedQuestIds: string[];
  draft: InferenceDraft;
}

export type GuardrailOutcome =
  | { status: 'passed'; result: InferenceDraft; violations: GuardrailViolation[] }
  | { status: 'sanitized'; result: InferenceDraft; violations: GuardrailViolation[] }
  | { status: 'crisis'; result: InferenceDraft }
  | { status: 'blocked'; violations: GuardrailViolation[] };

/**
 * Declaring the constants
 */

/**
 * The closed set of things a suggestion may propose (PRD §6.6.4): every member maps onto a field the
 * user can already edit on a Quest by hand. A suggestion outside this set is dropped rather than
 * shipped, so "the AI changed a mechanic" has no representable form to arrive in.
 */
export const ALLOWED_SUGGESTION_KINDS = ['shift_time', 'adjust_duration', 'adjust_strictness', 'adjust_reminder', 'pause_quest', 'split_quest'] as const;

/**
 * PRD §6.6.3 leaves the wording to the implementation — the requirement is a short supportive
 * non-clinical response plus regional crisis resources, and no coaching content attached. Regional
 * numbers rather than one country's, because the product ships to a single global origin.
 */
export const CRISIS_RESPONSE_ANSWER = [
  "I'm not able to answer this one as a coaching question, and I don't want to.",
  'If you are thinking about harming yourself, please talk to someone who can help right now:',
  '• US & Canada — call or text 988 (Suicide & Crisis Lifeline)',
  '• UK & Ireland — call 116 123 (Samaritans)',
  '• India — call 9152987821 (iCall)',
  '• Anywhere else — findahelpline.com lists a free, confidential line for your country',
  'If you are in immediate danger, please contact your local emergency number.',
].join('\n');

const MIN_QUOTE_WORDS = 7;
const MIN_SHORT_SOURCE_WORDS = 4;

const IDENTITY_LABELS = [
  'lazy',
  'depressed',
  'anxious',
  'procrastinator',
  'failure',
  'quitter',
  'undisciplined',
  'addict',
  'addicted',
  'broken',
  'hopeless',
  'weak',
  'unmotivated',
  'loser',
  'slob',
  'bad person',
  'burnout case',
].join('|');

const CLINICAL_LABELS = ['depression', 'anxiety disorder', 'adhd', 'add', 'bipolar disorder', 'ocd', 'burnout', 'an eating disorder', 'insomnia disorder'].join('|');

const IDENTITY_PATTERNS: RegExp[] = [
  new RegExp(
    String.raw`\byou(?:'re| are| were| have been| seem| sound| always seem)\s+(?:just |simply |so |really |such |clearly |probably |likely |a bit |kind of )*(?:a |an |the )?(?:${IDENTITY_LABELS})\b`,
    'i',
  ),
  new RegExp(String.raw`\byou (?:have|had|suffer from|struggle with|are dealing with|are experiencing)\s+(?:clinical |chronic |mild |severe )*(?:${CLINICAL_LABELS})\b`, 'i'),
  /\bdiagnos(?:is|ed|e|able)\b/i,
  /\bthis (?:is|looks like|sounds like) (?:clinical|textbook) \w+/i,
  /\byou(?:'re| are) (?:the (?:kind|type) of person|someone) who\b/i,
];

const SHAME_PATTERNS: RegExp[] = [
  /\byou failed (?:again|yet again)\b/i,
  /\byou should be ashamed\b/i,
  /\b(?:that's|this is) pathetic\b/i,
  /\bno excuse\b/i,
  /\bstop being (?:lazy|weak|so soft)\b/i,
  /\byou always (?:give up|quit|let yourself down)\b/i,
  /\bdisappointing\b/i,
];

const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)? myself\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bend(?:ing)? (?:it all|my life)\b/i,
  /\btake my own life\b/i,
  /\bwant to die\b/i,
  /\bbetter off dead\b/i,
  /\bno reason to (?:live|go on)\b/i,
  /\bself[- ]harm\b/i,
  /\b(?:hurt|harm|cut) (?:myself|my self)\b/i,
];

/** Output claiming the AI itself changed game state (PRD §6.6.4) — nothing in this path can, so such a claim is a lie to the user, not merely a style problem. */
const MECHANIC_MUTATION_PATTERNS: RegExp[] = [
  /\bI(?:'ve| have)? ?(?:already )?(?:updated|changed|adjusted|rescheduled|set|moved|paused|deleted|completed|awarded|granted|unlocked|applied)\b/i,
  /\b(?:I|we) (?:have )?(?:added|removed) (?:\d+ )?(?:xp|coins?|hp|crown)\b/i,
  /\byour (?:quest|xp|coins|streak|level|hp) (?:has|have) been (?:updated|changed|adjusted|awarded|reset)\b/i,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function draftText(draft: InferenceDraft): string {
  return [draft.answer, ...draft.patterns, ...draft.suggestions.map(suggestion => suggestion.text ?? ''), draft.limitationNote ?? ''].join('\n');
}

/**
 * A verbatim quote is a run of the user's own words reproduced unchanged (PRD §6.6.1). Matching on
 * word shingles rather than whole strings is what makes paraphrase pass and copy-paste fail; a source
 * shorter than the shingle is compared whole, down to a floor below which a "match" would just be a
 * common phrase.
 */
export function findVerbatimQuote(output: string, sensitiveSources: string[]): string | null {
  const haystack = normalize(output);
  if (!haystack) return null;

  for (const source of sensitiveSources) {
    const words = normalize(source).split(' ').filter(Boolean);
    if (words.length < MIN_SHORT_SOURCE_WORDS) continue;

    if (words.length <= MIN_QUOTE_WORDS) {
      const whole = words.join(' ');
      if (haystack.includes(whole)) return whole;
      continue;
    }
    for (let index = 0; index + MIN_QUOTE_WORDS <= words.length; index++) {
      const shingle = words.slice(index, index + MIN_QUOTE_WORDS).join(' ');
      if (haystack.includes(shingle)) return shingle;
    }
  }
  return null;
}

export function indicatesCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some(pattern => pattern.test(text));
}

function isApplicable(suggestion: DraftSuggestion, allowedQuestIds: string[]): boolean {
  if (!ALLOWED_SUGGESTION_KINDS.includes(suggestion.kind as (typeof ALLOWED_SUGGESTION_KINDS)[number])) return false;
  if (!allowedQuestIds.includes(String(suggestion.questId))) return false;
  return !MECHANIC_MUTATION_PATTERNS.some(pattern => pattern.test(suggestion.text ?? ''));
}

/**
 * The PRD §6.6 post-filter, release-gated by `tests/ai/guardrails.spec.ts`. Pure by construction: it
 * takes the model's draft and the exact sources the read assembly showed it, and returns what may ship
 * — it reads nothing, writes nothing, and therefore cannot be bypassed by a data path.
 *
 * Crisis is evaluated first and terminates the filter: the handoff answer replaces the draft entirely so
 * no coaching content can ride along with it, and the outcome carries no violation to record, because
 * §6.6.3 forbids marking the event in the user's data at all.
 */
export function applyGuardrails(input: GuardrailInput): GuardrailOutcome {
  const output = draftText(input.draft);
  if (indicatesCrisis(input.queryText) || input.sensitiveSources.some(indicatesCrisis) || indicatesCrisis(output)) {
    return { status: 'crisis', result: { answer: CRISIS_RESPONSE_ANSWER, patterns: [], suggestions: [], limitationNote: null } };
  }

  const violations: GuardrailViolation[] = [];
  if (findVerbatimQuote(output, input.sensitiveSources)) violations.push('verbatim_quote');
  if (IDENTITY_PATTERNS.some(pattern => pattern.test(output))) violations.push('identity_assertion');
  if (SHAME_PATTERNS.some(pattern => pattern.test(output))) violations.push('shame_copy');
  if (MECHANIC_MUTATION_PATTERNS.some(pattern => pattern.test(input.draft.answer) || input.draft.patterns.some(p => pattern.test(p)))) violations.push('mechanic_mutation');
  if (violations.length > 0) return { status: 'blocked', violations };

  const suggestions = input.draft.suggestions.filter(suggestion => isApplicable(suggestion, input.allowedQuestIds));
  if (suggestions.length === input.draft.suggestions.length) return { status: 'passed', result: input.draft, violations: [] };
  return { status: 'sanitized', result: { ...input.draft, suggestions }, violations: ['mechanic_mutation'] };
}

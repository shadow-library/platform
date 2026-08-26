import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type Ideation } from '@server/database';

/** The parts of a concept card a playbook filter can judge before the card has a fate. */
export type ConceptCandidate = Pick<Ideation.ConceptCard, 'title' | 'logline' | 'engine' | 'ladder' | 'posture'>;

export interface ConstraintPlaybook {
  key: string;
  /** Receives normalised text and tags — lowercase, punctuation collapsed to single spaces. */
  matches: (constraintText: string, tags: string[]) => boolean;
  /** What the shape promises the reader, in the terms the reader would recognise. */
  promises: string;
  /** The default tension or engine source the shape removes from the genre. */
  kills: string;
  /** What has to take the load once the default source is gone. */
  mustReplace: string;
  /** Question-bank ids this shape makes mandatory once their stage is reached. */
  forcedQuestions: string[];
  failureModes: string[];
  /** Hard filter on generated concept cards — a card that fails it is never shown. */
  conceptFilter?: (card: ConceptCandidate) => boolean;
}

export interface PlaybookMatch {
  playbook: ConstraintPlaybook;
  constraint: Ideation.SeedConstraint;
}

export interface PlaybookMatchResult {
  matched: PlaybookMatch[];
  unmatched: Ideation.SeedConstraint[];
}

const OPEN_ENDED_NEEDLES = [
  'open ended',
  'openended',
  'ongoing',
  'indefinite',
  'no planned ending',
  'no ending planned',
  'long running',
  'web serial',
  'never ends',
  'as long as readers',
  'hundreds of chapters',
  'thousand chapters',
];

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const NEEDLE_PATTERNS = new Map<string, RegExp>();

/**
 * A needle matches whole words only — 'experience' must not answer to 'xp'. A trailing `*` marks a stem
 * whose end is deliberately open ('reincarnat*' → reincarnated, reincarnation); everything else is
 * anchored at both ends, multi-word needles included, which makes them phrase matches.
 */
const needlePattern = (needle: string): RegExp => {
  const cached = NEEDLE_PATTERNS.get(needle);
  if (cached) return cached;

  const stem = needle.endsWith('*');
  const body = stem ? needle.slice(0, -1) : needle;
  const pattern = new RegExp(`\\b${body}${stem ? '' : '\\b'}`);
  NEEDLE_PATTERNS.set(needle, pattern);
  return pattern;
};

/** `haystack` must already be normalised — lowercase, punctuation collapsed to single spaces. */
const containsAny = (haystack: string, needles: string[]): boolean => needles.some(needle => needlePattern(needle).test(haystack));

const matcher =
  (needles: string[]) =>
  (constraintText: string, tags: string[]): boolean =>
    containsAny(`${constraintText} ${tags.join(' ')}`, needles);

/** True when a length answer commits the author to a story with no planned last chapter. */
export const isOpenEndedLength = (text: string | undefined): boolean => (text ? containsAny(normalise(text), OPEN_ENDED_NEEDLES) : false);

export const CONSTRAINT_PLAYBOOKS: ConstraintPlaybook[] = [
  {
    key: 'dual-leads',
    matches: matcher(['dual lead', 'dual leads', 'two leads', 'two protagonists', 'two mcs', 'co lead', 'co leads', 'both leads', 'second lead', 'shared protagonist']),
    promises: 'Two people the reader is asked to care about equally, and a book that is as much about the space between them as about either one alone.',
    kills: 'The single centre of gravity a genre story normally runs on — one want, one ladder, one head the reader lives in.',
    mustReplace:
      'Either a second ladder that rises on its own schedule, or an explicitly offset one where the second lead advances when the first stalls. Both work; neither is the same book, and having neither is not a third option.',
    forcedQuestions: ['deepen.secondLadder'],
    failureModes: [
      'One lead becomes a sidekick with extra dialogue within the first arcs — the reader stops turning to their chapters.',
      'Both leads want the same thing in the same way, so their scenes together stop generating friction.',
      'The two ladders rise in lockstep, which reads as one ladder with two names on it.',
    ],
    conceptFilter: card => containsAny(normalise(`${card.logline} ${card.engine} ${card.posture}`), ['two', 'both', 'pair*', 'partner*', 'dual', 'each other', 'together']),
  },
  {
    key: 'regression',
    matches: matcher([
      'regression',
      'regressor',
      'second life',
      'time loop',
      'loops back',
      'reincarnat*',
      'returned to the past',
      'do over',
      'knows the future',
      'foreknowledge',
      'rewind',
    ]),
    promises: 'Competence the reader gets to enjoy from page one — a lead who already knows where the traps are, and the pleasure of watching them spring them on someone else.',
    kills: 'Discovery. The ordinary engine of a first act — a protagonist learning the world alongside the reader — is gone before the book starts.',
    mustReplace:
      'A decaying advantage. Foreknowledge has to be spent, not held: every chapter the lead acts on what they remember, the timeline they remember drifts further from the one they are in, and something else has to become their edge.',
    forcedQuestions: ['deepen.foreknowledgeDecay', 'deepen.divergence'],
    failureModes: [
      'Foreknowledge never decays, so the lead is never wrong and the book stops having stakes.',
      'The second run replays the first, and the reader recognises a recap.',
      'The rules of the return are never fixed, so every rescue reads as an author intervention.',
    ],
  },
  {
    key: 'no-harem',
    matches: matcher(['no harem', 'anti harem', 'not a harem', 'single pairing', 'one romance', 'one love interest', 'single love interest', 'monogam*', 'no love triangle']),
    promises: 'A romance the reader can invest in without hedging — nobody is being kept in reserve, and the pairing named early is the pairing that ships.',
    kills: 'The genre default: the open question of who the lead ends up with, which is the cheapest recurring tension source progression fiction has.',
    mustReplace: 'Cost. Once "who" is settled, the pressure has to come from what staying together takes — what each of them gives up, hides, or refuses on the other\'s behalf.',
    forcedQuestions: ['deepen.stayingCost'],
    failureModes: [
      'The romance resolves in the first arc and then sits inert for the rest of the run.',
      'Rivals are introduced anyway and disposed of insincerely, which reads as the promise being tested rather than kept.',
      'The partner becomes a support function — always present, never costly.',
    ],
    conceptFilter: card => !containsAny(normalise(`${card.logline} ${card.posture}`), ['harem', 'love triangle*', 'suitor*', 'multiple love interests']),
  },
  {
    key: 'litrpg-system',
    matches: matcher([
      'litrpg',
      'lit rpg',
      'system window',
      'status window',
      'status screen',
      'game system',
      'stat block',
      'stats',
      'levels',
      'level up',
      'skill tree',
      'xp',
      'experience points',
      'class system',
    ]),
    promises: 'Progress the reader can audit. The number on the screen is a contract: when it moves, something real happened, and the reader is allowed to check the arithmetic.',
    kills: 'Vagueness as a safety net. "He grew stronger" stops being available once the book has shown a number.',
    mustReplace:
      'Hard rules with published limits. A system that can be extended whenever the plot needs a way out is scenery; the tension lives entirely in what the system is not allowed to do.',
    forcedQuestions: ['deepen.systemRules'],
    failureModes: [
      'The system gains a new mechanic exactly when the lead is cornered, and every later victory is discounted by the reader.',
      'Numbers inflate faster than the fiction around them, so the same fight reads identically at level 5 and level 500.',
      'The screen reports what the prose already said, which turns a mechanism into decoration.',
    ],
    conceptFilter: card => containsAny(normalise(`${card.engine} ${card.ladder}`), ['level*', 'stat*', 'rank*', 'tier*', 'skill*', 'system*', 'number*', 'point*', 'class*']),
  },
  {
    key: 'open-ended-length',
    matches: matcher(OPEN_ENDED_NEEDLES),
    promises: 'A story the reader can live inside — the reassurance that the world will still be there next week, and the week after that.',
    kills:
      'The ending. Every structural comfort that comes from knowing where the last chapter is: the planned climax, the arc that pays off on schedule, the ladder sized to the book.',
    mustReplace:
      'A renewal mechanism. The first ladder will top out — usually mid-run — and the story needs a second engine decided in advance, so the renewal is a plan rather than a panic.',
    forcedQuestions: ['deepen.renewal'],
    failureModes: [
      'The ladder runs out and the book stalls: the lead is the strongest thing in the setting and there is nothing left to escalate.',
      'The scale inflates instead of renewing — bigger enemies, same story, diminishing returns.',
      'Arcs stop resolving because no arc is allowed to end anything, and the reader loses the sense of progress the length promised.',
    ],
  },
  {
    key: 'ensemble',
    matches: matcher([
      'ensemble',
      'crew of',
      'party of',
      'multi pov',
      'multiple pov',
      'multiple povs',
      'rotating pov',
      'several leads',
      'four leads',
      'five leads',
      'group of protagonists',
    ]),
    promises: 'A world seen from several angles, and the particular pleasure of a group whose members are good at different things.',
    kills: "The reader's default attachment. With no single lead, nobody is automatically the person the reader worries about when the chapter breaks.",
    mustReplace:
      "A POV budget and a spine. Every viewpoint has to earn its chapters against the others, and one arc has to be the book's centre of gravity even while the camera moves.",
    forcedQuestions: ['deepen.povBudget'],
    failureModes: [
      'Viewpoints multiply until no thread advances fast enough to feel like progress.',
      'One character is obviously the real lead, so the others read as delay between their chapters.',
      'The group agrees too easily and becomes a single protagonist distributed across five names.',
    ],
  },
  {
    key: 'slow-burn',
    matches: matcher(['slow burn', 'slowburn', 'deferred romance', 'no romance until', 'long delayed romance', 'takes years', 'will they wont they']),
    promises: 'Anticipation as the product. The reader signs up for the wait because the wait is the pleasure, and the payoff is priced accordingly.',
    kills: 'Consummation as a tension release valve. The scene that would ordinarily discharge the pressure is off the table for most of the book.',
    mustReplace:
      'Something that tightens while nothing happens: proximity that cannot be escaped, obligation that keeps them in the same room, or the mounting cost of concealment.',
    forcedQuestions: ['deepen.deferredTension'],
    failureModes: [
      'Deferral without escalation — a slow burn that reads as a stalled one, because the gap between them is the same late in the run as it was on the first page.',
      'Contrived obstacles the reader can see the author placing, which converts patience into irritation.',
      'The payoff arrives and the book has nothing left, because the wait was the only engine.',
    ],
  },
  {
    key: 'single-pov',
    matches: matcher(['single pov', 'one pov', 'single viewpoint', 'one viewpoint', 'only pov', 'single perspective', 'first person', 'tight third', 'limited third']),
    promises: 'Intimacy and reliability of feeling — the reader is never pulled out of the one head they signed up for.',
    kills: 'The cutaway. Everything the lead cannot see, hear, or be told is information the reader simply cannot have.',
    mustReplace:
      'An irony budget spent deliberately: choose what the reader is kept from, and make the not-knowing do work — suspense, misjudgement, the collision when the withheld thing finally arrives.',
    forcedQuestions: ['deepen.ironyBudget'],
    failureModes: [
      'Villains become weather — they act off-page and the reader never fears them, only the results.',
      'Exposition is smuggled in through implausibly talkative informants.',
      "The lead is absent from the book's biggest event, and it has to be reported rather than felt.",
    ],
    conceptFilter: card => !containsAny(normalise(`${card.logline} ${card.engine} ${card.posture}`), ['multiple pov*', 'rotating pov*', 'several viewpoints', 'ensemble']),
  },
];

const PLAYBOOKS_BY_KEY = new Map(CONSTRAINT_PLAYBOOKS.map(playbook => [playbook.key, playbook]));

export const getPlaybook = (key: string): ConstraintPlaybook | undefined => PLAYBOOKS_BY_KEY.get(key);

function resolve(constraint: Ideation.SeedConstraint): ConstraintPlaybook | undefined {
  const explicit = constraint.playbookKey ? PLAYBOOKS_BY_KEY.get(constraint.playbookKey) : undefined;
  if (explicit) return explicit;

  const text = normalise(constraint.text);
  const tags = [constraint.key, constraint.kind, constraint.playbookKey ?? ''].map(normalise).filter(tag => tag !== '');
  return CONSTRAINT_PLAYBOOKS.find(playbook => playbook.matches(text, tags));
}

/**
 * Sorts locked constraints into the ones the library recognises and the ones it does not. An
 * unrecognised constraint is not an error: it still locks, and the generic "satisfy every locked
 * constraint" rule still filters concepts against it — it simply forces no questions. The log line
 * per unmatched key is the playbook backlog (ideation-studio design §3.2).
 */
export function matchPlaybooks(constraints: Ideation.SeedConstraint[]): PlaybookMatchResult {
  const matched: PlaybookMatch[] = [];
  const unmatched: Ideation.SeedConstraint[] = [];

  for (const constraint of constraints) {
    const playbook = resolve(constraint);
    if (playbook) matched.push({ playbook, constraint });
    else unmatched.push(constraint);
  }

  if (unmatched.length > 0) {
    const logger = Logger.getLogger(APP_NAME, 'ConstraintPlaybooks');
    for (const constraint of unmatched) logger.warn('locked constraint has no playbook', { key: constraint.key, kind: constraint.kind, text: constraint.text });
  }

  return { matched, unmatched };
}

export const activePlaybookKeys = (constraints: Ideation.SeedConstraint[]): string[] => {
  const keys = new Set<string>();
  for (const constraint of constraints) {
    const playbook = resolve(constraint);
    if (playbook) keys.add(playbook.key);
  }
  return [...keys];
};

export const hasPlaybook = (constraints: Ideation.SeedConstraint[], key: string): boolean => constraints.some(constraint => resolve(constraint)?.key === key);

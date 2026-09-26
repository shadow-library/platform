import { AppErrorCode } from '@server/classes';

import { countTokens, leadingChars } from './token-budget';

/**
 * The most each section the chapter writer always receives may take, in tokens, heading included. A section that grows with the book
 * (a prose tail, summaries, character sheets, continuation state, open canon, what the cast knows) is cut to its limit and its cuts are
 * recorded; one the author writes for this chapter (the plan, its reveals and clues, the volume goal, decisions) is never cut, so over
 * its limit the writing call fails with a message naming it.
 */
export const WRITER_SECTION_CAPS = {
  chapterPlan: 6_000,
  prevEnding: 1_000,
  continuationState: 2_000,
  recentSummaries: 1_500,
  povCard: 3_000,
  castCard: 1_000,
  knownFacts: 4_000,
  chapterReveals: 1_500,
  hiddenConstraints: 1_500,
  allowedClues: 1_000,
  openCanon: 3_000,
  volumeGoal: 800,
  completedVolumes: 1_500,
  writingStyle: 4_100,
  writerLines: 1_500,
  pluginSection: 2_000,
} as const;

/** The order optional sections claim what the required ones leave: pages the plan cites first, plugin material last. */
export const WRITER_OPTIONAL_PRIORITY = {
  citedPage: 1,
  castState: 2,
  castCard: 3,
  excessCard: 4,
  pluginSection: 5,
} as const;

export interface WriterReservation {
  /** How the author knows the section, as the failure message names it. */
  name: string;
  tokens: number;
  cap: number;
  /** Material the chapter plan brings in — the plan itself and the character sheets it names — which the author shrinks by editing the plan. */
  fromPlan?: boolean;
}

const LARGEST_NAMED = 2;

function tokenCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Fails when a required section is over its limit or the required sections together are over the writer's budget; silence means they all fit. */
export function assertWriterContextFits(reservations: readonly WriterReservation[], budgetTokens: number): void {
  const overCap = reservations.find(reservation => reservation.tokens > reservation.cap);
  if (overCap) {
    const overBy = overCap.tokens - overCap.cap;
    const detail = `${overCap.name} is ${tokenCount(overCap.tokens)} tokens, ${tokenCount(overBy)} over its ${tokenCount(overCap.cap)}-token limit; shorten it and try again`;
    throw AppErrorCode.CTX_002.create({ detail, section: overCap.name, overBy });
  }

  const total = reservations.reduce((sum, reservation) => sum + reservation.tokens, 0);
  if (total <= budgetTokens) return;
  const overBy = total - budgetTokens;
  const planned = reservations.filter(reservation => reservation.fromPlan).reduce((sum, reservation) => sum + reservation.tokens, 0);
  if (planned * 2 > total) {
    const detail =
      `the chapter plan and the characters it names take ${tokenCount(planned)} of the ${tokenCount(total)} tokens the required material needs, ` +
      `${tokenCount(overBy)} over the writer's ${tokenCount(budgetTokens)}-token budget — shorten the plan or name fewer characters in it`;
    throw AppErrorCode.CTX_002.create({ detail, section: 'the chapter plan', overBy });
  }
  const crossing = reservations.find((_, index) => reservations.slice(0, index + 1).reduce((sum, reservation) => sum + reservation.tokens, 0) > budgetTokens);
  const largest = [...reservations]
    .sort((left, right) => right.tokens - left.tokens)
    .slice(0, LARGEST_NAMED)
    .map(reservation => `${reservation.name} ${tokenCount(reservation.tokens)}`);
  const detail =
    `with ${crossing?.name ?? 'the last section'} the required material reaches ${tokenCount(total)} tokens, ` +
    `${tokenCount(overBy)} over the writer's ${tokenCount(budgetTokens)}-token budget (largest: ${largest.join(', ')}); shorten the largest and try again`;
  throw AppErrorCode.CTX_002.create({ detail, section: crossing?.name, overBy });
}

export interface CompletedVolume {
  ordinal: number;
  title: string;
  goal: string | null;
  /** The volume's finalized chapters, in order, with their summaries as stored. */
  chapters: { number: number; summary: string }[];
}

const VOLUME_BLOCK_CAP = 400;
const GOAL_CAP = 50;
const TURN_CAP = 50;
const CLOSING_CAP = 120;
const LATE_TURNS = 2;
const SENTENCE_END = /(?<=[.!?。！？])\s+/u;

/** The longest run of leading words within `maxTokens`, found by bisection so a long text costs a few encodings rather than one per word. */
function leadingWords(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) return text;
  const words = text.split(/ +/);
  let fits = 0;
  let over = words.length;
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (countTokens(words.slice(0, middle).join(' ')) < maxTokens) fits = middle;
    else over = middle;
  }
  return `${fits === 0 ? leadingChars(words[0] ?? '', maxTokens - 1) : words.slice(0, fits).join(' ')}…`;
}

function capped(text: string, maxTokens: number): string {
  return leadingWords(text.replace(/\s+/g, ' ').trim(), maxTokens);
}

type Scrub = (summary: string) => string;

function firstSentence(summary: string, scrub: Scrub): string {
  return capped(scrub(summary).split(SENTENCE_END, 1)[0] ?? '', TURN_CAP);
}

function volumeBlock(volume: CompletedVolume, scrub: Scrub): string | null {
  const first = volume.chapters[0];
  const last = volume.chapters.at(-1);
  if (!first || !last) return null;
  const span = first.number === last.number ? `chapter ${first.number}` : `chapters ${first.number}–${last.number}`;
  const lines = [`**Volume ${volume.ordinal}: ${volume.title}** (${span})`];
  if (volume.goal?.trim()) lines.push(`Goal: ${capped(volume.goal, GOAL_CAP)}`);
  if (first !== last) lines.push(`Opened: ${firstSentence(first.summary, scrub)}`);
  const turns = volume.chapters.slice(1, -1).slice(-LATE_TURNS);
  if (turns.length > 0) lines.push(`Late turns: ${turns.map(chapter => `ch ${chapter.number}: ${firstSentence(chapter.summary, scrub)}`).join(' ')}`);
  lines.push(`Where it left things: ${capped(scrub(last.summary), CLOSING_CAP)}`);
  const block = lines.join('\n');
  return leadingWords(block, VOLUME_BLOCK_CAP);
}

/**
 * What each completed volume left behind, built from its finalized chapter summaries with no model call; `scrub` makes each summary the
 * block quotes safe for the writer. The newest volumes are kept when they cannot all fit, and the text says how many earlier ones it leaves out.
 */
export function renderCompletedVolumes(volumes: readonly CompletedVolume[], maxTokens: number, scrub: Scrub = summary => summary): string | null {
  const blocks = [...volumes].sort((left, right) => left.ordinal - right.ordinal).flatMap(volume => volumeBlock(volume, scrub) ?? []);
  const kept: string[] = [];
  let used = 0;
  for (const block of [...blocks].reverse()) {
    const tokens = countTokens(block) + 2;
    if (used + tokens > maxTokens) break;
    kept.unshift(block);
    used += tokens;
  }
  if (kept.length === 0) return null;
  const left = blocks.length - kept.length;
  return [...(left > 0 ? [`(${left} earlier volume${left === 1 ? '' : 's'} not shown)`] : []), ...kept].join('\n\n');
}

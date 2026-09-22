import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

export const PROMISE_TOPIC = 'promise';
export const PROMISE_DRIVERS_MAX = 2;
export const PROMISES_MIN = 3;
export const PROMISES_MAX = 5;
export const PROMISE_TEXT_MAX = 200;
export const PROMISE_TONE_MAX = 60;
export const PROMISE_WHY_MAX = 400;
export const PROMISE_WRITER_LINE_MAX = 240;

export interface PromiseDriverOption {
  id: string;
  label: string;
  /** What this driver would mean for this novel, not what the word means in general. */
  fit: string;
  recommended?: boolean;
}

export interface PromiseLengthOption {
  id: string;
  label: string;
  note: string;
}

export interface PromiseToneOption {
  id: string;
  label: string;
  note: string;
}

export interface PromiseTextOption {
  id: string;
  text: string;
}

export interface PromiseTailoringRule {
  id: string;
  driver: string;
  when: 'present' | 'absent';
  effect: string;
}

export interface PromiseRound {
  drivers: PromiseDriverOption[];
  lengths: PromiseLengthOption[];
  tones: PromiseToneOption[];
  promises: PromiseTextOption[];
  tailoring: PromiseTailoringRule[];
  /** The coach's line for the promise it recommends; the screen offers it as a starting point, never as the answer. */
  writerLine: string;
}

export const EMPTY_PROMISE_ROUND: PromiseRound = { drivers: [], lengths: [], tones: [], promises: [], tailoring: [], writerLine: '' };

function parseList<T>(value: unknown, parse: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    const parsed = parse((candidate ?? {}) as Record<string, unknown>);
    return parsed === null ? [] : [parsed];
  });
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function parsePromiseRound(round: BlueprintRoundResponse | null): PromiseRound {
  const options = round?.options as Record<string, unknown> | null;
  if (options == null) return EMPTY_PROMISE_ROUND;
  return {
    drivers: parseList(options['drivers'], item =>
      typeof item['id'] === 'string'
        ? { id: item['id'], label: text(item['label']) || item['id'], fit: text(item['fit']), ...(item['recommended'] === true ? { recommended: true } : {}) }
        : null,
    ),
    lengths: parseList(options['lengths'], item =>
      typeof item['id'] === 'string' ? { id: item['id'], label: text(item['label']) || item['id'], note: text(item['note']) } : null,
    ),
    tones: parseList(options['tones'], item => (typeof item['id'] === 'string' ? { id: item['id'], label: text(item['label']), note: text(item['note']) } : null)),
    promises: parseList(options['promises'], item => (typeof item['id'] === 'string' && typeof item['text'] === 'string' ? { id: item['id'], text: item['text'] } : null)),
    tailoring: parseList(options['tailoring'], item =>
      typeof item['id'] === 'string' && typeof item['driver'] === 'string' && (item['when'] === 'present' || item['when'] === 'absent')
        ? { id: item['id'], driver: item['driver'], when: item['when'], effect: text(item['effect']) }
        : null,
    ),
    writerLine: text(options['writerLine']),
  };
}

export function promiseRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

/**
 * What these drivers change in the phases below. The wording comes from the round, which the server builds from the same rules
 * the later steps read for `appliesWhen` — so the screen cannot promise tailoring the Blueprint does not do.
 */
export function promiseEffects(tailoring: PromiseTailoringRule[], drivers: string[]): PromiseTailoringRule[] {
  return tailoring.filter(rule => drivers.includes(rule.driver) === (rule.when === 'present'));
}

/** At the cap the pills are disabled rather than silently dropping the oldest, so a third tap never un-chooses a driver unasked. */
export function toggleDriver(drivers: string[], driver: string): string[] {
  if (drivers.includes(driver)) return drivers.filter(candidate => candidate !== driver);
  return drivers.length >= PROMISE_DRIVERS_MAX ? drivers : [...drivers, driver];
}

export function driverAtCap(drivers: string[], driver: string): boolean {
  return drivers.length >= PROMISE_DRIVERS_MAX && !drivers.includes(driver);
}

export interface PromiseDraftText {
  /** Stable for the life of the row, so React keys it by identity rather than by the index the author is editing. */
  key: string;
  /** The promise the text came from; absent once the author has rewritten it. */
  optionId?: string;
  text: string;
}

export interface PromiseDraft {
  drivers: string[];
  length: string | null;
  tone: string;
  promises: PromiseDraftText[];
  why: string;
  /** The round's own writer line, as it was offered. What survives a re-roll is whatever the author wrote instead of it. */
  offeredWriterLine: string;
  writerLine: string;
}

export const EMPTY_PROMISE_DRAFT: PromiseDraft = { drivers: [], length: null, tone: '', promises: [], why: '', offeredWriterLine: '', writerLine: '' };

function roundPromises(round: PromiseRound): PromiseDraftText[] {
  return round.promises.map(promise => ({ key: promise.id, optionId: promise.id, text: promise.text }));
}

/** What the screen opens on: the coach's recommendation, its promises and its writer line, with whatever the author locked on top. */
export function initialPromiseDraft(round: PromiseRound, restored: Partial<PromiseDraft> = {}): PromiseDraft {
  const recommended = round.drivers.filter(driver => driver.recommended === true).map(driver => driver.id);
  return {
    drivers: restored.drivers ?? recommended.slice(0, PROMISE_DRIVERS_MAX),
    length: restored.length ?? null,
    tone: restored.tone ?? round.tones[0]?.label ?? '',
    promises: restored.promises ?? roundPromises(round),
    why: restored.why ?? '',
    offeredWriterLine: round.writerLine,
    writerLine: restored.writerLine ?? round.writerLine,
  };
}

/**
 * What survives a new round. The drivers, length and tone are the author's answers, so a rework of the wording never takes them
 * back; a line they wrote themselves survives too, and only the round's own line is replaced by the round's own line. The promises
 * are what the round reworked, so the fresh ones stand.
 */
export function nextPromiseDraft(current: PromiseDraft, round: PromiseRound): PromiseDraft {
  const authored = current.writerLine.trim() !== current.offeredWriterLine.trim();
  return {
    drivers: current.drivers,
    length: current.length,
    tone: current.tone,
    promises: roundPromises(round),
    why: current.why,
    offeredWriterLine: round.writerLine,
    writerLine: authored ? current.writerLine : round.writerLine,
  };
}

export function editPromiseText(promises: PromiseDraftText[], key: string, value: string): PromiseDraftText[] {
  return promises.map(promise => (promise.key === key ? { key: promise.key, text: value } : promise));
}

export function removePromiseText(promises: PromiseDraftText[], key: string): PromiseDraftText[] {
  return promises.filter(promise => promise.key !== key);
}

const OWN_KEY = /^own([0-9]+)$/;

export function addPromiseText(promises: PromiseDraftText[]): PromiseDraftText[] {
  if (promises.length >= PROMISES_MAX) return promises;
  const used = promises.map(promise => Number(OWN_KEY.exec(promise.key)?.[1] ?? 0));
  return [...promises, { key: `own${Math.max(0, ...used) + 1}`, text: '' }];
}

export interface PromiseSelection {
  drivers: string[];
  length: string;
  tone: string;
  toneOptionId?: string;
  promises: { optionId?: string; text: string }[];
  why?: string;
  writerLine: string;
}

/** Option ids are resolved against the round on screen, never remembered: a tone id from a round that has been replaced is not offered. */
export function buildPromiseSelection(draft: PromiseDraft, round: PromiseRound): PromiseSelection | null {
  const offered = new Set(round.promises.map(promise => promise.id));
  const promises = draft.promises
    .map(promise => ({ ...(promise.optionId != null && offered.has(promise.optionId) ? { optionId: promise.optionId } : {}), text: promise.text.trim() }))
    .filter(promise => promise.text);
  const tone = draft.tone.trim();
  const writerLine = draft.writerLine.trim();
  const why = draft.why.trim();
  if (draft.drivers.length === 0 || draft.length === null || !tone || !writerLine || promises.length < PROMISES_MIN) return null;
  const toneOptionId = round.tones.find(candidate => candidate.label.trim() === tone)?.id;
  return {
    drivers: draft.drivers,
    length: draft.length,
    tone,
    ...(toneOptionId ? { toneOptionId } : {}),
    promises: promises.slice(0, PROMISES_MAX),
    ...(why ? { why } : {}),
    writerLine,
  };
}

/** The promise already in the Notebook, so a revisit starts from what the author locked rather than from the coach's pick again. */
export function restorePromiseDraft(entries: LedgerEntryResponse[]): Partial<PromiseDraft> | null {
  const locked = [...entries].reverse().find(entry => entry.topic === PROMISE_TOPIC && entry.kind === 'decision');
  if (!locked) return null;
  const payload = (locked.payload ?? {}) as { drivers?: unknown; length?: unknown; tone?: unknown; promises?: unknown };
  const promises = Array.isArray(payload.promises) ? payload.promises.filter((promise): promise is string => typeof promise === 'string') : [];
  return {
    ...(Array.isArray(payload.drivers) ? { drivers: payload.drivers.filter((driver): driver is string => typeof driver === 'string') } : {}),
    ...(typeof payload.length === 'string' ? { length: payload.length } : {}),
    ...(typeof payload.tone === 'string' ? { tone: payload.tone } : {}),
    ...(promises.length > 0 ? { promises: promises.map((text, index) => ({ key: `own${index + 1}`, text })) } : {}),
    why: locked.why ?? '',
    writerLine: locked.writerLine ?? '',
  };
}

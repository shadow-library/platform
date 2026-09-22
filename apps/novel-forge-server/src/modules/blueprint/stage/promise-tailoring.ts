import { isPromiseLength, type PromiseDriver, type PromiseLength } from '@server/common';

import { isDecided, type StageLedgerEntry } from './blueprint-stage';

export const READER_PROMISE_TOPIC = 'promise';

export const PROMISE_TAILORING_IDS = ['opposition', 'power_ladder', 'reveal_schedule', 'seasons'] as const;

export type PromiseTailoringId = (typeof PROMISE_TAILORING_IDS)[number];

export interface PromiseTailoringRule {
  id: PromiseTailoringId;
  driver: PromiseDriver;
  /** Whether the rule fires when the driver is chosen or when it is not: a slice-of-life author is never asked for a villain. */
  when: 'present' | 'absent';
  effect: string;
}

/**
 * The one place the reader promise's consequences are written down. Later phases read it through `promiseTailoringApplies` for their
 * `appliesWhen`, and the promise screen shows the same rules as what a driver would change — so what the author is told and what the
 * Blueprint then does cannot drift apart.
 */
export const PROMISE_TAILORING: readonly PromiseTailoringRule[] = [
  { id: 'opposition', driver: 'slice_of_life', when: 'absent', effect: 'Core asks what stands in the protagonist’s way, with the kind pre-selected from these drivers.' },
  { id: 'power_ladder', driver: 'progression', when: 'present', effect: 'World asks for a power ladder and what each rung costs.' },
  { id: 'reveal_schedule', driver: 'mystery', when: 'present', effect: 'The Spine schedules the reveals the reader is waiting for.' },
  {
    id: 'seasons',
    driver: 'slice_of_life',
    when: 'present',
    effect: 'The Spine becomes seasons of life with milestones instead of movements and reveals, and the final check looks for rhythm and small change rather than escalation.',
  },
];

function fires(rule: PromiseTailoringRule, drivers: readonly string[]): boolean {
  return drivers.includes(rule.driver) === (rule.when === 'present');
}

export function promiseTailors(drivers: readonly string[], id: PromiseTailoringId): boolean {
  const rule = PROMISE_TAILORING.find(candidate => candidate.id === id);
  return rule !== undefined && fires(rule, drivers);
}

/** What these drivers change downstream, in the order the phases come. */
export function promiseEffects(drivers: readonly string[]): PromiseTailoringRule[] {
  return PROMISE_TAILORING.filter(rule => fires(rule, drivers));
}

/** What the reader-promise step locked — drivers, length and tone; null until the promise is decided. */
export function promisePayload(ledger: StageLedgerEntry[]): Record<string, unknown> | null {
  const promise = [...ledger].reverse().find(entry => entry.topic === READER_PROMISE_TOPIC && isDecided(entry));
  return typeof promise?.payload === 'object' && promise.payload !== null ? (promise.payload as Record<string, unknown>) : null;
}

/** The reader promise's drivers; none until the promise is decided. */
export function promiseDrivers(ledger: StageLedgerEntry[]): string[] {
  const drivers = promisePayload(ledger)?.['drivers'];
  return Array.isArray(drivers) ? drivers.filter((driver): driver is string => typeof driver === 'string') : [];
}

/** What a later step's `appliesWhen` asks: is this novel one the rule fires for? */
export function promiseTailoringApplies(id: PromiseTailoringId, ledger: StageLedgerEntry[]): boolean {
  return promiseTailors(promiseDrivers(ledger), id);
}

export function promiseLength(ledger: StageLedgerEntry[]): PromiseLength | null {
  const length = promisePayload(ledger)?.['length'];
  return isPromiseLength(length) ? length : null;
}

export function promiseTone(ledger: StageLedgerEntry[]): string | null {
  const tone = promisePayload(ledger)?.['tone'];
  return typeof tone === 'string' && tone.trim() ? tone : null;
}

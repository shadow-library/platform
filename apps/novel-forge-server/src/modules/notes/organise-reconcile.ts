import { type Ledger } from '@server/database';

import { type NewLedgerEntry } from '../ledger/ledger.types';
import { type OrganisePlan } from './organise-plan';
import { ORGANISE_STEP_KEY } from './organised-pages';

export interface OrganiseReconciliation {
  create: NewLedgerEntry[];
  supersede: { previous: Ledger.Entry; next: NewLedgerEntry }[];
  withdraw: Ledger.Entry[];
}

type Matcher = (previous: Ledger.Entry, next: NewLedgerEntry) => boolean;

const RECONCILED_KINDS: ReadonlySet<Ledger.Kind> = new Set(['decision', 'direction', 'rejected', 'system']);

function optionIdOf(entry: Pick<NewLedgerEntry, 'payload'>): string | undefined {
  const optionId = (entry.payload as { optionId?: unknown } | null | undefined)?.optionId;
  return typeof optionId === 'string' ? optionId : undefined;
}

const PAIRING: Matcher[] = [
  (previous, next) => optionIdOf(next) !== undefined && optionIdOf(previous) === optionIdOf(next),
  (previous, next) => previous.statement.trim() === next.statement.trim(),
  (previous, next) => optionIdOf(previous) === undefined && optionIdOf(next) === undefined,
];

/** Two entries that name different questions are different answers: pairing them would rewrite one as the other. */
function crossesOptions(previous: Ledger.Entry, next: NewLedgerEntry): boolean {
  const before = optionIdOf(previous);
  const after = optionIdOf(next);
  return before !== undefined && after !== undefined && before !== after;
}

/**
 * An organise answer is whole: it retires what earlier organise answers wrote on the topics it replaces. Each new entry supersedes an
 * earlier one of the same topic and kind — the same question first, then the same statement, then in order — so every topic keeps one
 * history chain; leftovers are created or withdrawn. An earlier entry that names a question is withdrawn only when the new answer speaks
 * to its topic and kind, or `retires` names its question. What the author wrote directly and backlog are never touched, and `withdraws`
 * takes down only organise's own entries.
 */
export function reconcileOrganiseEntries(plan: Pick<OrganisePlan, 'entries' | 'replaces' | 'retires' | 'withdraws'>, active: Ledger.Entry[]): OrganiseReconciliation {
  const next = plan.entries.map((entry): NewLedgerEntry => ({ ...entry, stepKey: ORGANISE_STEP_KEY }));
  const topics = new Set(plan.replaces);
  const replaceable = active.filter(entry => entry.stepKey === ORGANISE_STEP_KEY && topics.has(entry.topic) && RECONCILED_KINDS.has(entry.kind));

  const pairs = new Map<NewLedgerEntry, Ledger.Entry>();
  const taken = new Set<Ledger.Entry>();
  for (const matches of PAIRING) {
    for (const entry of next) {
      if (pairs.has(entry)) continue;
      const previous = replaceable.find(old => !taken.has(old) && old.topic === entry.topic && old.kind === entry.kind && !crossesOptions(old, entry) && matches(old, entry));
      if (!previous) continue;
      pairs.set(entry, previous);
      taken.add(previous);
    }
  }

  const answered = new Set(next.map(entry => `${entry.topic}|${entry.kind}`));
  const retired = new Set(plan.retires);
  const stranded = (entry: Ledger.Entry): boolean => {
    const optionId = optionIdOf(entry);
    return optionId === undefined || retired.has(optionId) || answered.has(`${entry.topic}|${entry.kind}`);
  };

  const withdraw = replaceable.filter(entry => !taken.has(entry) && stranded(entry));
  const named = new Set(plan.withdraws);
  const lifted = active.filter(entry => named.has(entry.id) && entry.stepKey === ORGANISE_STEP_KEY && !taken.has(entry) && !withdraw.includes(entry));

  return {
    create: next.filter(entry => !pairs.has(entry)),
    supersede: next.flatMap(entry => {
      const previous = pairs.get(entry);
      return previous ? [{ previous, next: entry }] : [];
    }),
    withdraw: [...withdraw, ...lifted],
  };
}

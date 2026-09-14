import { type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { failureCopy, METRICS_NOT_SET_UP_COPY, refusedCopy, rejectionCopy, supersededCopy } from './command-feedback';
import {
  type CommandDelivery,
  type CommandError,
  type DispatchOptions,
  type OutcomeConfirmation,
  type OutcomeTicket,
  type RunOutcome,
  type ServerSettlement,
  type SettledCommandResult,
  type SettledOutcome,
} from './command.types';

export type LocalReading<TLocal, TConfirm = never> =
  | { kind: 'confirm'; confirmation: TConfirm }
  | { kind: 'rejected'; message: string; error?: CommandError }
  | { kind: 'done'; local: TLocal; delivery?: CommandDelivery; xpAwarded: number; coinsAwarded: number };

export interface DomainCommandSpec<TCommand, TResult, TLocal, TConfirm = never> {
  dispatch: (command: TCommand, options?: DispatchOptions) => Promise<TResult>;
  read: (result: TResult) => LocalReading<TLocal, TConfirm>;
  queryClient: QueryClient;
  queryKey: QueryKey;
  /** Says what won a superseded command when the server's result does not, for a domain that can read it back from the mirror. */
  describeSuperseded?: (command: TCommand, result: Record<string, unknown>) => Promise<string | null>;
}

export interface RunOptions {
  /** Pass `false` for an action the owner may repeat on purpose (the same preset, the same side quest); forms keep the default. */
  dedupe?: boolean;
}

export interface CommandHandle<TCommand, TLocal, TConfirm = never> {
  /** After the calling component unmounts the promise never settles; the sync layer's notices report the outcome instead. */
  run: (command: TCommand, options?: RunOptions) => Promise<RunOutcome<TLocal, TConfirm>>;
  isPending: boolean;
  /** For item lists: whether a run of this command, or of any command the predicate matches, is in flight. */
  isPendingFor: (match: TCommand | ((command: TCommand) => boolean)) => boolean;
}

type AnyOutcome<TLocal, TConfirm> = SettledOutcome<TLocal> | OutcomeConfirmation<TConfirm>;

interface InFlight<TCommand> {
  key: string;
  command: TCommand;
}

const UNMOUNTED = new Promise<never>(() => undefined);

function numberIn(result: Record<string, unknown>, key: string, fallback: number): number {
  const value = result[key];
  return typeof value === 'number' ? value : fallback;
}

export function readSettledResult(result: SettledCommandResult): LocalReading<SettledCommandResult> {
  if (result.status === 'rejected') return { kind: 'rejected', message: result.message, error: result.error };
  return { kind: 'done', local: result, delivery: result.delivery, xpAwarded: result.xpAwarded, coinsAwarded: result.coinsAwarded };
}

/** The claim is already acknowledged here, so a failed read-back must not lose the outcome. */
async function describeWinner<TCommand, TResult, TLocal, TConfirm>(
  spec: DomainCommandSpec<TCommand, TResult, TLocal, TConfirm>,
  command: TCommand,
  result: Record<string, unknown>,
): Promise<string | null> {
  try {
    return (await spec.describeSuperseded?.(command, result)) ?? null;
  } catch {
    return null;
  }
}

/** Invalidation joins a first fetch already in flight rather than restarting it, and that fetch read the state from before the apply. */
async function refresh(spec: Pick<DomainCommandSpec<unknown, unknown, unknown>, 'queryClient' | 'queryKey'>): Promise<void> {
  await spec.queryClient.cancelQueries({ queryKey: spec.queryKey });
  await spec.queryClient.invalidateQueries({ queryKey: spec.queryKey });
}

async function toOutcome<TCommand, TResult, TLocal, TConfirm>(
  spec: DomainCommandSpec<TCommand, TResult, TLocal, TConfirm>,
  command: TCommand,
  reading: Extract<LocalReading<TLocal, TConfirm>, { kind: 'done' }>,
  settlement: ServerSettlement,
): Promise<SettledOutcome<TLocal>> {
  switch (settlement.status) {
    case 'applied':
      return {
        status: 'applied',
        local: reading.local,
        xpAwarded: numberIn(settlement.result, 'xpAwarded', reading.xpAwarded),
        coinsAwarded: numberIn(settlement.result, 'coinsAwarded', reading.coinsAwarded),
      };
    case 'unconfirmed':
      return { status: 'queued-offline', local: reading.local, reason: settlement.reason };
    case 'rejected':
      return { status: 'rejected', message: rejectionCopy(settlement.code, settlement.result), code: settlement.code, undone: true };
    case 'superseded':
      return { status: 'superseded', message: (await describeWinner(spec, command, settlement.result)) ?? supersededCopy(settlement.result) };
    case 'failed':
      return { status: 'failed', message: failureCopy(settlement.code), code: settlement.code, undone: true };
    case 'refused':
      return { status: 'refused', message: refusedCopy(settlement.boundary), boundary: settlement.boundary };
  }
}

interface RunScope<TCommand, TResult, TLocal, TConfirm> {
  spec: DomainCommandSpec<TCommand, TResult, TLocal, TConfirm>;
  tickets: Set<OutcomeTicket>;
  mounted: { current: boolean };
}

async function awaitTicket(scope: RunScope<unknown, unknown, unknown, unknown>, ticket: OutcomeTicket): Promise<ServerSettlement> {
  const settlement = await ticket.settled;
  scope.tickets.delete(ticket);
  if (!scope.mounted.current) {
    ticket.release();
    return UNMOUNTED;
  }
  ticket.acknowledge();
  return settlement;
}

async function settleTicketed<TCommand, TResult, TLocal, TConfirm>(
  scope: RunScope<TCommand, TResult, TLocal, TConfirm>,
  command: TCommand,
  reading: LocalReading<TLocal, TConfirm>,
  ticket: OutcomeTicket | undefined,
): Promise<AnyOutcome<TLocal, TConfirm>> {
  const { spec, mounted } = scope;
  await refresh(spec);
  if (reading.kind === 'confirm') return { status: 'needs-confirmation', confirmation: reading.confirmation };
  if (reading.kind === 'rejected') {
    const code = reading.error?.code ?? null;
    return reading.error?.kind === 'unavailable'
      ? { status: 'failed', message: reading.message, code, undone: false }
      : { status: 'rejected', message: reading.message, code, undone: false };
  }

  const delivery = reading.delivery ?? { status: 'local' };
  if (delivery.status === 'unaddressed') return { status: 'rejected', message: METRICS_NOT_SET_UP_COPY, code: null, undone: false };
  if (delivery.status === 'local') return { status: 'applied', local: reading.local, xpAwarded: reading.xpAwarded, coinsAwarded: reading.coinsAwarded };
  if (delivery.status === 'refused') return { status: 'refused', message: refusedCopy(delivery.boundary), boundary: delivery.boundary };
  if (!ticket) return { status: 'queued-offline', local: reading.local, reason: 'slow' };

  const outcome = await toOutcome(spec, command, reading, await awaitTicket(scope as RunScope<unknown, unknown, unknown, unknown>, ticket));
  await refresh(spec);
  return mounted.current ? outcome : UNMOUNTED;
}

async function settle<TCommand, TResult, TLocal, TConfirm>(scope: RunScope<TCommand, TResult, TLocal, TConfirm>, command: TCommand): Promise<AnyOutcome<TLocal, TConfirm>> {
  const { spec, tickets, mounted } = scope;
  const reading = spec.read(await spec.dispatch(command, { awaitOutcome: true }));
  const ticket = reading.kind === 'done' && reading.delivery?.status === 'queued' ? reading.delivery.ticket : undefined;
  if (ticket) tickets.add(ticket);
  if (!mounted.current) {
    ticket?.release();
    return UNMOUNTED;
  }

  try {
    return await settleTicketed(scope, command, reading, ticket);
  } catch (error) {
    if (ticket) tickets.delete(ticket);
    ticket?.release();
    throw error;
  }
}

/** In-flight runs are keyed by the command itself, so a double click on a form is a no-op while completing two different quests in a row is not. */
export function useDomainCommand<TCommand, TResult, TLocal, TConfirm = never>(
  spec: DomainCommandSpec<TCommand, TResult, TLocal, TConfirm>,
): CommandHandle<TCommand, TLocal, TConfirm> {
  const scope = useRef<RunScope<TCommand, TResult, TLocal, TConfirm>>({ spec, tickets: new Set(), mounted: { current: true } });
  const running = useRef(new Map<string, Promise<AnyOutcome<TLocal, TConfirm>>>());
  const [inFlight, setInFlight] = useState<readonly InFlight<TCommand>[]>([]);

  useEffect(() => {
    scope.current.spec = spec;
  });

  useEffect(() => {
    const { tickets, mounted } = scope.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const ticket of tickets) ticket.release();
      tickets.clear();
    };
  }, []);

  const run = useCallback((command: TCommand, options: RunOptions = {}): Promise<RunOutcome<TLocal, TConfirm>> => {
    const key = JSON.stringify(command);
    const dedupe = options.dedupe !== false;
    const existing = dedupe ? running.current.get(key) : undefined;
    if (existing) return existing as Promise<RunOutcome<TLocal, TConfirm>>;

    const entry: InFlight<TCommand> = { key, command };
    const outcome = settle(scope.current, command).finally(() => {
      if (dedupe) running.current.delete(key);
      setInFlight(current => current.filter(item => item !== entry));
    });
    if (dedupe) running.current.set(key, outcome);
    setInFlight(current => [...current, entry]);
    return outcome as Promise<RunOutcome<TLocal, TConfirm>>;
  }, []);

  const isPendingFor = (match: TCommand | ((command: TCommand) => boolean)): boolean => {
    if (typeof match === 'function') return inFlight.some(item => (match as (command: TCommand) => boolean)(item.command));
    const key = JSON.stringify(match);
    return inFlight.some(item => item.key === key);
  };

  return { run, isPending: inFlight.length > 0, isPendingFor };
}

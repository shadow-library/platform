import { toast } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';

import { accountApi, type DeletionState, stepUpUrl } from '@/lib/apis';
import {
  type AccountCommand,
  type CommandBoundary,
  commandRefusal,
  DELETION_ACCOUNT_UNCONFIRMED,
  DELETION_ACKNOWLEDGEMENTS,
  DELETION_ALTERNATIVES,
  DELETION_DEVICE_ERROR,
  DELETION_START_UNCONFIRMED,
  DELETION_START_UNCONFIRMED_CODE,
  DELETION_STARTED,
  DELETION_STOPPED,
  DELETION_TERMS,
  DELETION_UNACKNOWLEDGED,
  DELETION_UNEXPECTED,
  DELETION_WRONG_ACCOUNT,
  type DeletionProgress,
  type DeletionStage,
  type DeletionView,
  type ErasureDevice,
  type ErasureStartedResult,
  NETWORK_ERROR_CODE,
  REAUTH_HANDOFF_COPY,
  type SettledCommandResult,
  toCommandError,
} from '@/lib/data';
import { safeReturnTo } from '@/lib/return-to';

import { AccountBoundaryError } from './memoir-store';
import { projectRecordCounts } from './projection';
import { type SyncEngine } from './sync-engine';
import { SYNC_META_KEYS } from './sync.types';

type DeletionCommand = Extract<AccountCommand, { type: `deletion.${string}` }>;

type PendingStep = 'acknowledging' | 'confirming' | 'reauth-expired' | 'start-unconfirmed';

type DeletionFlow = { step: PendingStep; acknowledged: string[]; at: string } | { step: 'started'; startedAt: string };

/** A bound store without a session probe could send the start for whichever account the cookie now belongs to. */
export class MissingSessionProbeError extends Error {
  constructor() {
    super('Account deletion needs a session probe for a store bound to an account.');
    this.name = 'MissingSessionProbeError';
  }
}

const DELETION_PATH = '/settings/delete';

export const DELETION_FLOW_TTL_MS = 60 * 60 * 1000;

const PENDING_STEPS: ReadonlySet<string> = new Set<PendingStep>(['acknowledging', 'confirming', 'reauth-expired', 'start-unconfirmed']);

const PROGRESS: ReadonlySet<string> = new Set<Exclude<DeletionState, 'none'>>(['pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done']);

const ALREADY_STARTED = 'The erasure has already started, and it cannot be stopped.';

const NOT_STARTED = 'The erasure could not be started.';

const UNANSWERED_CODES: ReadonlySet<string> = new Set(['API_REQUEST_TIMEOUT', 'API_REQUEST_NETWORK_ERROR', 'NETWORK_ERROR', NETWORK_ERROR_CODE]);

const GATEWAY_STATUSES: ReadonlySet<number> = new Set([-1, 502, 503, 504]);

function now(): string {
  return new Date().toISOString();
}

function emptyFlow(): DeletionFlow {
  return { step: 'acknowledging', acknowledged: [], at: now() };
}

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function rejected(message: string): SettledCommandResult {
  return { status: 'rejected', message };
}

function unavailable(message: string, code: string): SettledCommandResult {
  return { status: 'rejected', message, error: { code, kind: 'unavailable' } };
}

function unconfirmedStart(): SettledCommandResult {
  return unavailable(DELETION_START_UNCONFIRMED, DELETION_START_UNCONFIRMED_CODE);
}

function refused(boundary: CommandBoundary): SettledCommandResult {
  return { status: 'applied', message: '', xpAwarded: 0, coinsAwarded: 0, delivery: { status: 'refused', boundary } };
}

function errorCode(error: unknown): string | null {
  return isApiError(error) ? error.code : null;
}

function isSignedOut(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/** No answer, or a gateway's answer, says nothing about whether the server behind it went on to commit the start. */
function isUnanswered(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return GATEWAY_STATUSES.has(error.status) || UNANSWERED_CODES.has(error.code);
}

function isFresh(at: unknown): boolean {
  if (typeof at !== 'string') return false;
  const age = Date.now() - Date.parse(at);
  return age >= 0 && age <= DELETION_FLOW_TTL_MS;
}

/** Stored acknowledgements go stale after an hour: a statement ticked yesterday is not a decision made today. */
function toDeletionFlow(value: unknown): DeletionFlow {
  if (typeof value !== 'object' || value === null) return emptyFlow();
  const record = value as Record<string, unknown>;
  const { step, at, startedAt } = record;
  if (step === 'started') return typeof startedAt === 'string' ? { step, startedAt } : emptyFlow();
  if (typeof step !== 'string' || !PENDING_STEPS.has(step) || typeof at !== 'string') return emptyFlow();

  const pending = step as PendingStep;
  const fresh = isFresh(at);
  if (!fresh && pending !== 'start-unconfirmed') return emptyFlow();

  const known = new Set(DELETION_ACKNOWLEDGEMENTS.map(item => item.id));
  const listed = Array.isArray(record['acknowledged']) ? record['acknowledged'] : [];
  const acknowledged = fresh ? [...new Set(listed.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
  return { step: pending, acknowledged, at };
}

function acknowledgedIn(flow: DeletionFlow): string[] {
  return flow.step === 'started' ? [] : flow.acknowledged;
}

function hasEveryAcknowledgement(flow: DeletionFlow): boolean {
  return acknowledgedIn(flow).length === DELETION_ACKNOWLEDGEMENTS.length;
}

function toProgress(state: string): DeletionProgress {
  return PROGRESS.has(state) ? (state as DeletionProgress) : 'unknown';
}

/**
 * The deletion flow, kept in the account's store meta because the step-up prompt is a full-page round trip. Every step runs in
 * order, and the start is sent only from a confirmed flow, for the account the session still belongs to.
 */
export class SyncedDeletion {
  private steps: Promise<unknown> = Promise.resolve();
  private starting: Promise<SettledCommandResult> | null = null;

  constructor(
    private readonly sync: SyncEngine,
    private readonly principal?: () => Promise<string>,
  ) {}

  async view(): Promise<DeletionView> {
    const flow = await this.readFlow();
    return {
      stage: await this.stage(flow),
      sets: projectRecordCounts(this.sync.domains()),
      acknowledgements: DELETION_ACKNOWLEDGEMENTS,
      acknowledged: acknowledgedIn(flow),
      reauth: { ...REAUTH_HANDOFF_COPY, continueTo: stepUpUrl(safeReturnTo(DELETION_PATH)) },
      alternatives: DELETION_ALTERNATIVES,
      terms: DELETION_TERMS,
    };
  }

  dispatch(command: DeletionCommand): Promise<SettledCommandResult> {
    switch (command.type) {
      case 'deletion.acknowledge':
        return this.inOrder(() => this.acknowledge(command.acknowledgementId, command.acknowledged));

      case 'deletion.continue':
        return this.inOrder(() => this.continue());

      case 'deletion.begin':
        this.starting ??= this.inOrder(() => this.begin()).finally(() => (this.starting = null));
        return this.starting;

      case 'deletion.abandon':
        return this.inOrder(() => this.abandon());
    }
  }

  /**
   * The status read sits behind the same elevation as the start, so `IAM_003` is how a session that is not elevated learns it, and the
   * start revokes the app session, so a `401` right after a start was sent may be that erasure rather than a sign-out.
   */
  private async stage(flow: DeletionFlow): Promise<DeletionStage> {
    const startedAt = flow.step === 'started' ? flow.startedAt : null;
    const underway: DeletionStage = { kind: 'underway', progress: 'unknown', startedAt };

    try {
      const { deletionState } = await accountApi.deletionStatus();
      if (deletionState !== 'none') return { kind: 'underway', progress: toProgress(deletionState), startedAt };
      const confirmed = flow.step === 'confirming' || flow.step === 'reauth-expired' || flow.step === 'start-unconfirmed';
      return confirmed && hasEveryAcknowledgement(flow) ? { kind: 'confirm' } : { kind: 'idle' };
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ACC_002') return underway;
      if (startedAt !== null && (code === 'IAM_003' || isSignedOut(error))) return underway;
      if (flow.step === 'start-unconfirmed' && isSignedOut(error)) return { kind: 'unconfirmed', reason: 'signed-out' };
      if (code !== 'IAM_003' && flow.step === 'start-unconfirmed') return { kind: 'unconfirmed', reason: 'unreachable' };
      if (code !== 'IAM_003') throw error;
      if (await this.accountIsBeingDeleted()) return underway;
      if (!hasEveryAcknowledgement(flow)) return { kind: 'idle' };
      if (flow.step === 'confirming' || flow.step === 'start-unconfirmed') return { kind: 'awaiting-reauth', reason: 'step-up' };
      if (flow.step === 'reauth-expired') return { kind: 'awaiting-reauth', reason: 'expired' };
      return { kind: 'idle' };
    }
  }

  /** A mirror that has not pulled since the erasure started still says nothing is wrong, so the account read is asked directly. */
  private async accountIsBeingDeleted(): Promise<boolean> {
    if ((await this.sync.store.readMeta<boolean>(SYNC_META_KEYS.deletionPending)) === true) return true;
    try {
      await accountApi.get();
      return false;
    } catch (error) {
      return errorCode(error) === 'ACC_002';
    }
  }

  private async readFlow(): Promise<DeletionFlow> {
    return toDeletionFlow(await this.sync.store.readMeta<unknown>(SYNC_META_KEYS.deletionFlow));
  }

  private async writeFlow(flow: DeletionFlow): Promise<void> {
    await this.sync.store.writeMeta(SYNC_META_KEYS.deletionFlow, flow);
  }

  /** Every step reads the flow and writes it back, so two quick ticks would otherwise each keep only their own statement. */
  private inOrder(step: () => Promise<SettledCommandResult>): Promise<SettledCommandResult> {
    const result = this.steps.then(step).catch((error: unknown) => {
      if (error instanceof AccountBoundaryError && error.boundary === 'closed') return unavailable(DELETION_UNEXPECTED, 'DELETION_STORE_CLOSED');
      if (error instanceof AccountBoundaryError) return this.wrongAccount(error.boundary);
      if (error instanceof MissingSessionProbeError) throw error;
      return unavailable(DELETION_DEVICE_ERROR, 'DELETION_DEVICE');
    });
    this.steps = result.catch(() => undefined);
    return result;
  }

  private async acknowledge(acknowledgementId: string, acknowledged: boolean): Promise<SettledCommandResult> {
    const flow = await this.readFlow();
    if (flow.step === 'started') return rejected(ALREADY_STARTED);
    const others = flow.acknowledged.filter(id => id !== acknowledgementId);
    await this.writeFlow({ step: 'acknowledging', acknowledged: acknowledged ? [...others, acknowledgementId] : others, at: now() });
    return applied('');
  }

  /** Nothing is started here: the status read only proves the server is reachable, and the next read decides between the confirmation and the step-up. */
  private async continue(): Promise<SettledCommandResult> {
    const flow = await this.readFlow();
    if (flow.step === 'started') return rejected(ALREADY_STARTED);
    if (!hasEveryAcknowledgement(flow)) return rejected(DELETION_UNACKNOWLEDGED);

    try {
      await accountApi.deletionStatus();
    } catch (error) {
      const code = errorCode(error);
      if (code !== 'IAM_003' && code !== 'ACC_002') return commandRefusal(error, 'Couldn’t check whether this account can be deleted right now.');
    }

    await this.writeFlow({ step: 'confirming', acknowledged: flow.acknowledged, at: now() });
    return applied('');
  }

  private async begin(): Promise<SettledCommandResult> {
    const flow = await this.readFlow();
    if (flow.step === 'started') return rejected(ALREADY_STARTED);
    if (flow.step === 'acknowledging' || !hasEveryAcknowledgement(flow)) return rejected(DELETION_UNACKNOWLEDGED);

    const sessionRefusal = await this.checkSessionAccount();
    if (sessionRefusal) return sessionRefusal;

    try {
      await accountApi.startDeletion();
    } catch (error) {
      if (errorCode(error) === 'IAM_003') {
        await this.writeFlow({ step: 'reauth-expired', acknowledged: flow.acknowledged, at: now() });
        return applied('');
      }
      if (!isSignedOut(error) && toCommandError(error).kind === 'refusal') return commandRefusal(error, NOT_STARTED);
      return this.settleUncertainStart(flow, error);
    }

    return this.finishStart();
  }

  /** The probe moves the shared session to the other account, which rebuilds the shell and unmounts the screen, so the refusal is told here. */
  private async checkSessionAccount(): Promise<SettledCommandResult | null> {
    const { store } = this.sync;
    if (store.accountId === undefined) return null;
    if (!this.principal) throw new MissingSessionProbeError();
    if (store.ownerChanged()) return this.wrongAccount('owner-changed');

    let principal: string;
    try {
      principal = await this.principal();
    } catch (error) {
      return unavailable(DELETION_ACCOUNT_UNCONFIRMED, toCommandError(error).code);
    }
    return principal === store.accountId ? null : this.wrongAccount('principal-changed');
  }

  private wrongAccount(boundary: CommandBoundary): SettledCommandResult {
    toast.warning(DELETION_WRONG_ACCOUNT);
    return refused(boundary);
  }

  /**
   * A start that got no clear answer may already be running, and a repeated start is answered with the state in flight, so the status decides.
   * An unanswered start may still commit after that read, so only a start the server itself answered can be called not started.
   */
  private async settleUncertainStart(flow: Extract<DeletionFlow, { step: PendingStep }>, error: unknown): Promise<SettledCommandResult> {
    const state = await accountApi.deletionStatus().then(
      status => status.deletionState,
      () => null,
    );
    if (state !== null && state !== 'none') return this.finishStart();
    if (state === 'none' && !isUnanswered(error)) return commandRefusal(error, NOT_STARTED);
    await this.writeFlow({ step: 'start-unconfirmed', acknowledged: flow.acknowledged, at: now() }).catch(() => undefined);
    return unconfirmedStart();
  }

  /** The server has revoked this session, so this device's copy of the account goes now rather than lingering behind a sign-in page. */
  private async finishStart(): Promise<ErasureStartedResult> {
    const { store } = this.sync;
    const device: ErasureDevice =
      store.accountId === undefined
        ? 'kept'
        : await store.wipeAccount().then(
            () => 'removed' as const,
            () => 'kept' as const,
          );
    if (device === 'kept') await this.writeFlow({ step: 'started', startedAt: now() }).catch(() => undefined);
    store.close();
    return { status: 'applied', message: DELETION_STARTED, xpAwarded: 0, coinsAwarded: 0, erasure: { device } };
  }

  private async abandon(): Promise<SettledCommandResult> {
    const flow = await this.readFlow();
    if (flow.step === 'started') return rejected(ALREADY_STARTED);
    await this.writeFlow(emptyFlow());
    return applied(DELETION_STOPPED);
  }
}

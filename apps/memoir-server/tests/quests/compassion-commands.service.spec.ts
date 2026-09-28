import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type CommandBus, type CommandContext, type CommandHandler, type HeroLedger } from '@modules/commands';
import { type ProgressionService } from '@modules/progression';
import { CompassionCommandsService } from '@modules/quests';
import { type RolloverRepository } from '@modules/rollover';
import { type DatabaseTransaction, type RecoveryQuest } from '@server/database';

const ACCOUNT_ID = 1n;
const DATE = '2026-03-10';

function harness(completed: RecoveryQuest.Row | null, existing: RecoveryQuest.Row | null = completed) {
  const handlers = new Map<string, CommandHandler>();
  const recoveriesCompleted: string[] = [];
  const commandBus = { registerHandler: (type: string, handler: CommandHandler) => handlers.set(type, handler) } as unknown as CommandBus;
  const heroLedger = { grant: async () => [{ xpDelta: 10, coinsDelta: 2 }] } as unknown as HeroLedger;
  const rolloverRepository = {
    completeRecoveryQuest: async () => completed,
    findRecoveryForDate: async () => existing,
    lockDailyState: async () => null,
    lockAccount: async () => ({ id: ACCOUNT_ID, timezone: 'UTC', lastHpDate: DATE }),
  } as unknown as RolloverRepository;
  const progression = {
    onRecoveryQuestCompleted: async (_tx: unknown, _accountId: bigint, date: string) => recoveriesCompleted.push(date),
  } as unknown as ProgressionService;

  const service = new CompassionCommandsService(commandBus, heroLedger, rolloverRepository, progression);
  service.onModuleInit();
  const run = (type: string, payload: Record<string, unknown> = {}) => {
    const handler = handlers.get(type);
    if (!handler) throw new Error(`no handler registered for '${type}'`);
    const context: CommandContext = { accountId: ACCOUNT_ID, tx: {} as DatabaseTransaction, envelope: { commandId: 'c-1', type, payload, localDate: DATE } };
    return handler(context);
  };
  return { run, recoveriesCompleted };
}

const RECOVERY = { id: 7n, accountId: ACCOUNT_ID, date: DATE, state: 'completed', sourceQuestId: 3n, triggerLogIds: [] } as unknown as RecoveryQuest.Row;

describe('CompassionCommandsService', () => {
  beforeEach(() => setSystemTime(new Date(`${DATE}T12:00:00Z`)));
  afterEach(() => setSystemTime());

  it('should count a completed Recovery toward first_recovery_completed and restorer', async () => {
    const { run, recoveriesCompleted } = harness(RECOVERY);

    const outcome = await run('recovery.complete');

    expect(outcome.status).toBe('applied');
    expect(recoveriesCompleted).toEqual([DATE]);
  });

  it('should not count a replayed completion of a Recovery that was already completed', async () => {
    const { run, recoveriesCompleted } = harness(null, RECOVERY);

    const outcome = await run('recovery.complete');

    expect(outcome.status).toBe('superseded');
    expect(recoveriesCompleted).toEqual([]);
  });
});

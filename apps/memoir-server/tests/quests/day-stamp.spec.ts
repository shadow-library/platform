import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type CommandBus, type CommandContext, type CommandHandler, type HeroLedger } from '@modules/commands';
import { type ProgressionService } from '@modules/progression';
import { CompassionCommandsService, QuestCommandsService, type QuestLogRepository, type QuestRepository, type QuestStreakRepository } from '@modules/quests';
import { type RolloverRepository, type RolloverService } from '@modules/rollover';
import { type DeltaRepository, type DeltaSourceRegistry } from '@modules/sync';
import { type Account, type DatabaseTransaction, type Quest } from '@server/database';

const ACCOUNT_ID = 1n;
const TODAY = '2026-03-10';
const ACCOUNT = { id: ACCOUNT_ID, timezone: 'UTC', intensityMode: 'standard', lastHpDate: TODAY } as Account.Row;
const QUEST = {
  id: 7n,
  accountId: ACCOUNT_ID,
  active: true,
  strictness: 'routine',
  recurrence: { frequency: 'daily', interval: 1, startDate: { year: 2026, month: 1, day: 1 }, end: { kind: 'never' } },
} as unknown as Quest.Row;

/** Reached only once the day check has let a command through; the handler's later steps are not this spec's concern. */
class PastTheDayCheck extends Error {}

const passed = (): never => {
  throw new PastTheDayCheck();
};

function context(type: string, payload: Record<string, unknown>, localDate = TODAY): CommandContext {
  const tx = { select: () => ({ from: () => ({ where: async () => [ACCOUNT] }) }) } as unknown as DatabaseTransaction;
  return { accountId: ACCOUNT_ID, tx, envelope: { commandId: 'c-1', type, payload, localDate } };
}

function handlers(): Map<string, CommandHandler> {
  const registered = new Map<string, CommandHandler>();
  const commandBus = { registerHandler: (type: string, handler: CommandHandler) => registered.set(type, handler) } as unknown as CommandBus;
  const rolloverRepository = {
    lockAccount: async () => ACCOUNT,
    lockDailyState: passed,
    completeRecoveryQuest: passed,
  } as unknown as RolloverRepository;
  const questRepository = { findByIdForUpdate: async () => QUEST } as unknown as QuestRepository;
  const registry = { register: () => undefined } as unknown as DeltaSourceRegistry;

  new QuestCommandsService(
    commandBus,
    {} as HeroLedger,
    {} as ProgressionService,
    questRepository,
    {} as QuestLogRepository,
    {} as QuestStreakRepository,
    rolloverRepository,
    {} as RolloverService,
    registry,
    {} as DeltaRepository,
  ).onModuleInit();
  new CompassionCommandsService(commandBus, {} as HeroLedger, rolloverRepository, {} as ProgressionService).onModuleInit();
  return registered;
}

function run(type: string, payload: Record<string, unknown>, localDate?: string): Promise<unknown> {
  const handler = handlers().get(type);
  if (!handler) throw new Error(`no handler registered for '${type}'`);
  return handler(context(type, payload, localDate));
}

describe('command day stamps', () => {
  afterEach(() => setSystemTime());

  it.each(['quest.complete', 'quest.partial', 'quest.skip'])('should refuse %s for an occurrence after the account’s today', async type => {
    setSystemTime(new Date(`${TODAY}T12:00:00Z`));

    await expect(run(type, { occurrenceId: `7:2026-03-11` })).rejects.toMatchObject({ code: 'QST_009' });
  });

  it.each(['quest.complete', 'quest.skip'])('should let %s for today or an earlier day, as an offline outcome is, past the day check', async type => {
    setSystemTime(new Date(`${TODAY}T12:00:00Z`));

    await expect(run(type, { occurrenceId: `7:${TODAY}` })).rejects.toBeInstanceOf(PastTheDayCheck);
    await expect(run(type, { occurrenceId: '7:2026-03-08' })).rejects.toBeInstanceOf(PastTheDayCheck);
  });

  it.each([
    ['plan.setLock', { locked: false }],
    ['recovery.complete', {}],
  ])('should refuse %s stamped with a day other than the account’s today', async (type, payload) => {
    setSystemTime(new Date(`${TODAY}T12:00:00Z`));

    await expect(run(type, payload, '2026-03-09')).rejects.toMatchObject({ code: 'CMD_002' });
    await expect(run(type, payload, '2026-03-11')).rejects.toMatchObject({ code: 'CMD_002' });
    await expect(run(type, payload, TODAY)).rejects.toBeInstanceOf(PastTheDayCheck);
  });

  it('should accept tomorrow’s occurrence from a clock a little ahead in the last five minutes of the day', async () => {
    setSystemTime(new Date(`${TODAY}T23:55:00Z`));

    await expect(run('quest.complete', { occurrenceId: '7:2026-03-11' })).rejects.toBeInstanceOf(PastTheDayCheck);
  });

  it('should still refuse tomorrow’s occurrence just outside the five minutes, and any later day inside them', async () => {
    setSystemTime(new Date(`${TODAY}T23:54:59Z`));
    await expect(run('quest.complete', { occurrenceId: '7:2026-03-11' })).rejects.toMatchObject({ code: 'QST_009' });

    setSystemTime(new Date(`${TODAY}T23:59:59Z`));
    await expect(run('quest.complete', { occurrenceId: '7:2026-03-12' })).rejects.toMatchObject({ code: 'QST_009' });
  });

  it.each([
    ['plan.setLock', { locked: false }],
    ['recovery.complete', {}],
  ])('should keep refusing %s stamped for tomorrow in the last minutes of today, since that day is not prepared yet', async (type, payload) => {
    setSystemTime(new Date(`${TODAY}T23:59:00Z`));

    await expect(run(type, payload, '2026-03-11')).rejects.toMatchObject({ code: 'CMD_002' });
  });
});

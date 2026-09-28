import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type CommandBus, type CommandHandler, type HeroLedger } from '@modules/commands';
import { type ProgressionService } from '@modules/progression';
import { CompassionCommandsService } from '@modules/quests';
import { type ActivityStart, type RolloverRepository } from '@modules/rollover';
import { type DatabaseTransaction, type QuestLog } from '@server/database';

const ACCOUNT_ID = 1n;
const TODAY = '2026-03-20';
const QUEST_IDS = ['7'];

function completedOn(date: string, count: number): QuestLog.Row[] {
  return Array.from({ length: count }, () => ({ date, state: 'completed' }) as QuestLog.Row);
}

async function lockCapacity(logs: QuestLog.Row[], start: ActivityStart): Promise<unknown> {
  const handlers = new Map<string, CommandHandler>();
  const commandBus = { registerHandler: (type: string, handler: CommandHandler) => handlers.set(type, handler) } as unknown as CommandBus;
  const rolloverRepository = {
    lockAccount: async () => ({ id: ACCOUNT_ID, timezone: 'UTC', lastHpDate: TODAY }),
    lockDailyState: async () => ({ date: TODAY, rolloverAt: null, momentumBucket: 'steady' }),
    listQuestLogs: async (_tx: unknown, _accountId: bigint, from: string, to: string) => logs.filter(log => log.date >= from && log.date <= to),
    findActivityStart: async () => start,
    updateDailyStateIfOpen: async () => true,
  } as unknown as RolloverRepository;
  new CompassionCommandsService(commandBus, {} as HeroLedger, rolloverRepository, {} as ProgressionService).onModuleInit();

  const tx = { select: () => ({ from: () => ({ where: async () => QUEST_IDS.map(id => ({ id: BigInt(id) })) }) }) } as unknown as DatabaseTransaction;
  const outcome = await handlers.get('plan.setLock')?.({
    accountId: ACCOUNT_ID,
    tx,
    envelope: { commandId: 'c-1', type: 'plan.setLock', payload: { locked: true, questIds: QUEST_IDS }, localDate: TODAY },
  });
  return outcome?.result['capacity'];
}

describe('plan.setLock capacity', () => {
  beforeEach(() => setSystemTime(new Date(`${TODAY}T12:00:00Z`)));
  afterEach(() => setSystemTime());

  it('should count the days without a completion toward the median', async () => {
    const capacity = await lockCapacity(completedOn('2026-03-19', 3), { firstLogDate: '2026-03-17', firstQuestAt: new Date('2026-03-17T08:00:00Z') });

    expect(capacity).toBe(1);
  });

  it('should read a whole window of empty days as a capacity of one, not as a new user', async () => {
    const capacity = await lockCapacity([], { firstLogDate: null, firstQuestAt: new Date('2026-02-01T08:00:00Z') });

    expect(capacity).toBe(1);
  });

  it('should only count days since the account began, so a new account’s first days keep their median', async () => {
    const logs = [...completedOn('2026-03-19', 4), ...completedOn('2026-03-18', 4)];

    const capacity = await lockCapacity(logs, { firstLogDate: '2026-03-18', firstQuestAt: new Date('2026-03-18T08:00:00Z') });

    expect(capacity).toBe(5);
  });

  it('should seat an account with no history before today at the new-user baseline', async () => {
    const capacity = await lockCapacity([], { firstLogDate: null, firstQuestAt: new Date(`${TODAY}T08:00:00Z`) });

    expect(capacity).toBe(14);
  });
});

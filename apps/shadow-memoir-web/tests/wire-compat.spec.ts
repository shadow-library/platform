import { describe, expect, it } from 'vitest';

import { homeAmountOf } from '@/lib/data';
import { projectFinanceRows, projectWorldState, type SyncCommand, toWireCommand, type WireCommand } from '@/lib/sync';

import fixtures from './fixtures/wire-commands.json';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Scenario {
  scenario: string;
  command: SyncCommand;
  wire: WireCommand;
  performedAt?: string;
}

/**
 * Pins `toWireCommand`'s output for every server-backed command in all four unions against `tests/fixtures/wire-commands.json`, a byte-identical copy of
 * which lives at `apps/shadow-memoir-server/tests/sync/fixtures/wire-commands.json` and is driven through
 * the real command endpoint by `wire-compat.spec.ts` there. Neither workspace can import the other's `src`
 * (the server's `tsconfig.json` has no path alias into the web app, and `command-wire.ts` pulls in the
 * whole `@/lib/data` barrel), so the JSON fixture is what keeps the two sides honest about the wire shape
 * instead of a shared import.
 */
describe('command-wire fixtures (FE-4)', () => {
  for (const entry of fixtures as unknown as Scenario[]) {
    it(`should build the pinned wire payload for ${entry.scenario}`, () => {
      const wire = toWireCommand(entry.command);

      if (entry.command.type !== 'quest.create') {
        expect(wire).toEqual(entry.wire);
        return;
      }

      const { entityRef, ...payload } = wire.payload;
      expect({ type: wire.type, payload }).toEqual(entry.wire);
      expect(entityRef).toMatch(UUID_V7);
    });
  }
});

describe('projection (UI-004, UI-005)', () => {
  it('should project the server health threshold shape', () => {
    const world = projectWorldState(
      {
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        quests: [{ id: 'q1', name: 'Move 8,000 steps', healthThreshold: { metricId: '501', value: 8000, comparison: 'gte' } }],
      },
      '2026-09-10',
    );

    expect(world.quests[0]?.healthThreshold).toEqual({ metricKey: 'steps', value: 8000, comparison: 'gte' });
  });

  it('should skip a malformed or unresolvable health threshold instead of crashing', () => {
    const world = projectWorldState(
      {
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        quests: [
          { id: 'q1', name: 'Old shape', healthThreshold: { metric: 'steps', target: 8000, unit: 'steps' } },
          { id: 'q2', name: 'Unknown metric', healthThreshold: { metricId: '999', value: 1, comparison: 'gte' } },
          { id: 'q3', name: 'Bad comparison', healthThreshold: { metricId: '501', value: 8000, comparison: 'more-than' } },
        ],
      },
      '2026-09-10',
    );

    expect(world.quests.map(quest => quest.healthThreshold)).toEqual([null, null, null]);
  });

  it('should treat a null home amount in the home currency as the amount', () => {
    const { expenses } = projectFinanceRows({
      expenses: [{ id: 'e1', amountMinor: 6415, currency: 'EUR', homeAmountMinor: null, fxRate: null, occurredOn: '2026-09-10', loggedAt: '2026-09-10T10:00:00Z' }],
    });

    expect(expenses).toHaveLength(1);
    expect(homeAmountOf(expenses[0]!, 'EUR')).toBe(6415);
  });
});

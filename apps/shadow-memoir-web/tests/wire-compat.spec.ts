import { describe, expect, it } from 'vitest';

import { type Command } from '@/lib/data';
import { toWireCommand, type WireCommand } from '@/lib/sync';

import fixtures from './fixtures/wire-commands.json';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Scenario {
  scenario: string;
  command: Command;
  wire: WireCommand;
  performedAt?: string;
}

/**
 * Pins `toWireCommand`'s output against `tests/fixtures/wire-commands.json`, a byte-identical copy of
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

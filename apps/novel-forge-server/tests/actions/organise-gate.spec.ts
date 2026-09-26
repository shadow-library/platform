import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { assertNotesUnorganised } from '@modules/actions/action-jobs';
import { inputScreens } from '@modules/ai/hard-line';
import { organiseContext } from '@modules/notes';

import { ledgerEntry } from '../ledger/ledger-fixtures';

const dialect = new PgDialect();

describe('organiseContext', () => {
  it('should hand the author’s notes to the model as their own input, so the hard line screens them as the author’s words', () => {
    const ledger = [ledgerEntry({ topic: 'start.brief', statement: 'Ilse carries sealed letters up from the salt mine.' }), ledgerEntry({ id: 2n, kind: 'decision' })];

    const context = organiseContext(ledger);
    const notes = inputScreens({ ...context }).filter(screen => screen.text.includes('Ilse carries'));

    expect(context.stableContext).not.toContain('Ilse carries');
    expect(notes).toEqual([{ text: context.authorNotes, scope: 'supplied', source: 'Your notes' }]);
  });
});

describe('assertNotesUnorganised', () => {
  function gateOver(organised: { id: bigint }[], decision: { createdAt: Date }[] = []) {
    const wheres: SQL[] = [];
    const rows = (result: unknown[]) => ({ limit: async () => result, orderBy: () => ({ limit: async () => result }) });
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: (where: SQL) => {
            if (table !== schema.refinementProposals) return rows(decision);
            wheres.push(where);
            return rows(organised);
          },
        }),
      }),
    };
    return { db, wheres };
  }

  it('should refuse while an organise card waits for the author, whenever it was staged', async () => {
    const { db, wheres } = gateOver([{ id: 42n }], [{ createdAt: new Date('2026-09-26T10:00:00Z') }]);

    await expect(assertNotesUnorganised(db as never, 1n)).rejects.toMatchObject({ code: 'NTS_004' });
    const query = dialect.sqlToQuery(wheres[0] as SQL);
    expect(query.sql).toContain('("refinement_proposals"."status" = $3 or ("refinement_proposals"."status" = $4 and "refinement_proposals"."created_at" > $5))');
    expect(query.params.slice(1, 4)).toEqual(['organise', 'pending', 'applied']);
  });

  it('should let organising start when no organise card is pending or newly applied', async () => {
    const { db } = gateOver([]);

    await expect(assertNotesUnorganised(db as never, 1n)).resolves.toBeUndefined();
  });
});

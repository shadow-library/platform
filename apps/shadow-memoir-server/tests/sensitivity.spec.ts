import { describe, expect, it } from 'bun:test';

import { bigserial, pgTable, text } from 'drizzle-orm/pg-core';

import { getSensitivityManifest, sensitive } from '@server/database/sensitivity';

const fixtureTable = pgTable('sensitivity_fixture', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  note: text('note'),
  reflection: text('reflection'),
});

describe('sensitive', () => {
  it('should return the column unchanged', () => {
    const column = sensitive(fixtureTable.note, 'sensitive');
    expect(column).toBe(fixtureTable.note);
  });

  it('should record the table, column, and classification in the manifest', () => {
    sensitive(fixtureTable.reflection, 'most-sensitive');
    const entry = getSensitivityManifest().find(candidate => candidate.table === 'sensitivity_fixture' && candidate.column === 'reflection');
    expect(entry?.classification).toBe('most-sensitive');
  });
});

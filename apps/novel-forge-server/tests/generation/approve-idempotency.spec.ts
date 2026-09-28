import { describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { draftRow, fakeGenerationDb, knowledgeFixture, makeGenerationService } from './generation-fixtures';

describe('user_feedback', () => {
  it('should scope the idempotency key to its project, so one tenant cannot claim another tenant key', () => {
    const uniques = getTableConfig(schema.userFeedback).uniqueConstraints.map(constraint => constraint.columns.map(column => column.name));

    expect(uniques).toEqual([['project_id', 'idempotency_key']]);
  });
});

describe('GenerationService.approveDraft — idempotency', () => {
  it('should treat a retried key as a duplicate only within the same project', async () => {
    const fake = fakeGenerationDb({ draftReads: [draftRow()], draftWriteResult: [draftRow()], knowledge: knowledgeFixture() });
    const service = makeGenerationService(fake.db);

    await service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n, idempotencyKey: 'approve-ch4' });

    const [feedback] = fake.writesTo(schema.userFeedback);
    expect(feedback?.values).toMatchObject({ projectId: 1n, idempotencyKey: 'approve-ch4' });
    expect([feedback?.conflictTarget].flat().map(column => (column as { name: string }).name)).toEqual(['project_id', 'idempotency_key']);
  });
});

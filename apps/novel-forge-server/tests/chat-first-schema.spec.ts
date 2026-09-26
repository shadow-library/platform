import { describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

type Table = Parameters<typeof getTableConfig>[0];

function column(table: Table, name: string) {
  const found = getTableConfig(table).columns.find(candidate => candidate.name === name);
  expect(found?.name).toBe(name);
  return found as NonNullable<typeof found>;
}

describe('chat-first schema', () => {
  it('should default every new lifecycle column to the state existing rows are already in', () => {
    expect(column(schema.projects, 'cost_tier')).toMatchObject({ notNull: true, default: 'balanced' });
    expect(column(schema.volumes, 'state')).toMatchObject({ notNull: true, default: 'not_started' });
    expect(column(schema.briefs, 'is_ending')).toMatchObject({ notNull: true, default: false });
    expect(column(schema.characterKnowledge, 'status')).toMatchObject({ notNull: true, default: 'committed' });
    expect(column(schema.milestones, 'state')).toMatchObject({ notNull: true, default: 'open' });
  });

  it('should leave every per-override and per-plan column nullable, so null keeps meaning "inherit"', () => {
    const nullable: [Table, string][] = [
      [schema.briefs, 'content_mode'],
      [schema.chatSessions, 'content_mode'],
      [schema.chatSessions, 'cost_tier'],
      [schema.modelCalls, 'cost_source'],
      [schema.modelCalls, 'tier'],
      [schema.modelCalls, 'content_mode'],
      [schema.chapters, 'volume_key'],
      [schema.canonFacts, 'unlock'],
      [schema.canonFacts, 'disclosed_in_chapter'],
    ];
    for (const [table, name] of nullable) expect(column(table, name).notNull).toBe(false);
  });

  it('should key milestones by project and hold one authoring claim per project', () => {
    expect(getTableConfig(schema.milestones).uniqueConstraints.map(constraint => constraint.columns.map(col => col.name))).toEqual([['project_id', 'milestone_key']]);
    expect(column(schema.authoringClaims, 'project_id').primary).toBe(true);
    expect(getTableConfig(schema.authoringClaims).foreignKeys.map(key => key.onDelete)).toEqual(['cascade', 'restrict']);
    expect(column(schema.authoringClaims, 'claimed_by').notNull).toBe(false);
  });

  it('should index the proposal a chat message applied, so a proposal delete does not scan every message', () => {
    const indexed = getTableConfig(schema.chatMessages).indexes.map(index => index.config.columns.map(col => (col as { name: string }).name));
    expect(indexed).toContainEqual(['applied_proposal_id']);
  });

  it('should add the chat-first job and refinement kinds', () => {
    expect(schema.jobKind.enumValues).toEqual(expect.arrayContaining(['organise', 'plan']));
    expect(schema.refinementKind.enumValues).toEqual(expect.arrayContaining(['chapter_plan', 'organise']));
  });
});

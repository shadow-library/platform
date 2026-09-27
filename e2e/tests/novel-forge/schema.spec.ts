/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';
import { type TransactionSql } from 'postgres';

/**
 * Importing user defined packages
 */
import { novelForgeDb } from '../../lib';
import { uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

class ThrowawayInsertError extends Error {
  override readonly name = 'ThrowawayInsertError';
}

/**
 * Declaring the constants
 *
 * DB-level invariants (NF2-SCHEMA-01), asserted directly against Postgres rather than through the API: a unique or check
 * constraint violation, and a foreign key's cascade/set-null behaviour. Every arrangement is a throwaway `owner_kind:'user'`,
 * `owner_id:NULL` project (nullable in the schema, so no identity actor is needed) inside a transaction the test itself rolls
 * back — either because the constraint violation aborts it (`sql.begin()` rejects and rolls back automatically), or because
 * the read-then-rollback helper below throws a sentinel after reading back what it needs to assert. Either way nothing
 * survives the test.
 *
 * `character_states.entity_key` carries no foreign key to `entities` (only a shared `project_id`), so an entity's own delete
 * does not cascade its `character_states` row — only the project's delete does; that half of the invariant is the only one
 * this file does not assert, because it is not true.
 */

async function insertThrowawayProject(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO projects (owner_kind, owner_id, name, kind) VALUES ('user'::owner_kind, NULL, ${`e2e-schema-${uniqueSuffix()}`}, 'new_novel'::project_kind) RETURNING id::text
  `;
  if (!row) throw new ThrowawayInsertError('throwaway project insert returned no row');
  return row.id;
}

/**
 * Runs `arrange` inside a transaction, always rolling it back: `arrange` reads back whatever state it needs to assert before
 * the rollback discards it, and returns that snapshot. One shared sentinel-and-catch dance instead of a bespoke `Rollback`
 * subclass per test.
 */
async function readThenRollback<T>(arrange: (tx: TransactionSql) => Promise<T>): Promise<T> {
  class Snapshot extends Error {
    constructor(readonly value: T) {
      super('e2e read-then-rollback');
    }
  }
  try {
    await novelForgeDb().begin(async tx => {
      throw new Snapshot(await arrange(tx));
    });
    throw new ThrowawayInsertError('readThenRollback: the transaction committed instead of rolling back');
  } catch (err) {
    if (err instanceof Snapshot) return err.value;
    throw err;
  }
}

test.describe('novel-forge database invariants', () => {
  test('should keep one character_states row per project and entity, and cascade it when the project is deleted', async () => {
    const sql = novelForgeDb();

    const duplicate = sql.begin(async tx => {
      const projectId = await insertThrowawayProject(tx);
      await tx`INSERT INTO character_states (project_id, entity_key, last_updated_chapter) VALUES (${projectId}, 'e2e_char', 1)`;
      await tx`INSERT INTO character_states (project_id, entity_key, last_updated_chapter) VALUES (${projectId}, 'e2e_char', 1)`;
    });
    await expect(duplicate, 'a second character_states row for the same (project, entity) is refused').rejects.toMatchObject({
      code: '23505',
      constraint_name: 'character_states_project_id_entity_key_unique',
    });

    const remaining = await readThenRollback(async tx => {
      const projectId = await insertThrowawayProject(tx);
      await tx`INSERT INTO character_states (project_id, entity_key, last_updated_chapter) VALUES (${projectId}, 'e2e_char', 1)`;
      await tx`DELETE FROM projects WHERE id = ${projectId}`;
      const [row] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM character_states WHERE project_id = ${projectId}`;
      return row?.count ?? -1;
    });
    expect(remaining, 'a project delete cascades its character_states rows').toBe(0);
  });

  test('should keep chat_messages ordinals unique per session', async () => {
    const sql = novelForgeDb();
    const duplicate = sql.begin(async tx => {
      const projectId = await insertThrowawayProject(tx);
      const [session] = await tx<{ id: string }[]>`INSERT INTO chat_sessions (project_id, scope_type) VALUES (${projectId}, 'project'::chat_scope) RETURNING id::text`;
      if (!session) throw new ThrowawayInsertError('chat session insert returned no row');
      await tx`INSERT INTO chat_messages (session_id, project_id, ordinal, role, content) VALUES (${session.id}, ${projectId}, 1, 'user'::chat_message_role, 'first')`;
      await tx`INSERT INTO chat_messages (session_id, project_id, ordinal, role, content) VALUES (${session.id}, ${projectId}, 1, 'user'::chat_message_role, 'second')`;
    });
    await expect(duplicate, 'a second message at the same (session, ordinal) is refused').rejects.toMatchObject({
      code: '23505',
      constraint_name: 'chat_messages_session_id_ordinal_unique',
    });
  });

  test('should cascade a chat session delete to its messages and null the session on any proposal it started', async () => {
    const result = await readThenRollback(async tx => {
      const projectId = await insertThrowawayProject(tx);
      const [session] = await tx<{ id: string }[]>`INSERT INTO chat_sessions (project_id, scope_type) VALUES (${projectId}, 'project'::chat_scope) RETURNING id::text`;
      if (!session) throw new ThrowawayInsertError('chat session insert returned no row');
      await tx`INSERT INTO chat_messages (session_id, project_id, ordinal, role, content) VALUES (${session.id}, ${projectId}, 1, 'user'::chat_message_role, 'e2e')`;
      const [proposal] = await tx<{ id: string }[]>`
        INSERT INTO refinement_proposals (project_id, session_id, scope_type, kind, change_set, baseline)
        VALUES (${projectId}, ${session.id}, 'project'::chat_scope, 'chat'::refinement_kind, '[]'::jsonb, '{}'::jsonb)
        RETURNING id::text
      `;
      if (!proposal) throw new ThrowawayInsertError('proposal insert returned no row');
      await tx`DELETE FROM chat_sessions WHERE id = ${session.id}`;
      const [messages] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM chat_messages WHERE session_id = ${session.id}`;
      const [after] = await tx<{ sessionId: string | null }[]>`SELECT session_id::text AS "sessionId" FROM refinement_proposals WHERE id = ${proposal.id}`;
      // A missing row and a correctly-nulled `session_id` must read as different outcomes — `after` is checked for existing first.
      const proposalSessionId = after ? after.sessionId : 'e2e-row-missing';
      return { messages: messages?.count ?? -1, proposalSessionId };
    });
    expect(result).toEqual({ messages: 0, proposalSessionId: null });
  });

  test('should refuse a bot-owned project with no organisation', async () => {
    const sql = novelForgeDb();
    const rejected = sql.begin(async tx => {
      await tx`INSERT INTO projects (owner_kind, owner_id, organisation_id, name, kind) VALUES ('bot'::owner_kind, NULL, NULL, ${`e2e-schema-bot-${uniqueSuffix()}`}, 'new_novel'::project_kind)`;
    });
    await expect(rejected, 'a bot project with no organisation_id violates projects_bot_owner_organisation_check').rejects.toMatchObject({
      code: '23514',
      constraint_name: 'projects_bot_owner_organisation_check',
    });
  });

  test('should hold one publication per project and a globally unique slug, defaulting status to draft', async () => {
    const status = await readThenRollback(async tx => {
      const projectId = await insertThrowawayProject(tx);
      const slug = `e2e-schema-slug-${uniqueSuffix()}`;
      const [publication] = await tx<{ status: string }[]>`
        INSERT INTO publications (project_id, novel_slug, title) VALUES (${projectId}, ${slug}, 'E2E Schema Novel') RETURNING status
      `;
      if (!publication) throw new ThrowawayInsertError('publication insert returned no row');
      return publication.status;
    });
    expect(status).toBe('draft');

    const sql = novelForgeDb();
    const secondOnSameProject = sql.begin(async tx => {
      const projectId = await insertThrowawayProject(tx);
      await tx`INSERT INTO publications (project_id, novel_slug, title) VALUES (${projectId}, ${`e2e-schema-a-${uniqueSuffix()}`}, 'First')`;
      await tx`INSERT INTO publications (project_id, novel_slug, title) VALUES (${projectId}, ${`e2e-schema-b-${uniqueSuffix()}`}, 'Second')`;
    });
    await expect(secondOnSameProject, 'a second publications row for the same project is refused').rejects.toMatchObject({
      code: '23505',
      constraint_name: 'publications_project_id_unique',
    });

    const sharedSlug = `e2e-schema-shared-${uniqueSuffix()}`;
    const collidingSlug = sql.begin(async tx => {
      const first = await insertThrowawayProject(tx);
      const second = await insertThrowawayProject(tx);
      await tx`INSERT INTO publications (project_id, novel_slug, title) VALUES (${first}, ${sharedSlug}, 'First')`;
      await tx`INSERT INTO publications (project_id, novel_slug, title) VALUES (${second}, ${sharedSlug}, 'Second')`;
    });
    await expect(collidingSlug, 'novel_slug is unique across every project, not just within one').rejects.toMatchObject({
      code: '23505',
      constraint_name: 'publications_novel_slug_unique',
    });
  });

  test('should keep chapter_publications ordinals unique per project', async () => {
    const sql = novelForgeDb();
    const duplicate = sql.begin(async tx => {
      const projectId = await insertThrowawayProject(tx);
      await tx`
        INSERT INTO chapter_publications (project_id, chapter, published_ordinal, title, content_hash) VALUES (${projectId}, 1, 1, 'Chapter One', 'e2e-hash-1')
      `;
      await tx`
        INSERT INTO chapter_publications (project_id, chapter, published_ordinal, title, content_hash) VALUES (${projectId}, 2, 1, 'Chapter Two', 'e2e-hash-2')
      `;
    });
    await expect(duplicate, 'a second chapter at the same published_ordinal for the project is refused').rejects.toMatchObject({
      code: '23505',
      constraint_name: 'chapter_publications_project_id_published_ordinal_unique',
    });
  });

  test('should cascade a project delete to its publication and chapter publications', async () => {
    const result = await readThenRollback(async tx => {
      const projectId = await insertThrowawayProject(tx);
      await tx`INSERT INTO publications (project_id, novel_slug, title) VALUES (${projectId}, ${`e2e-schema-cascade-${uniqueSuffix()}`}, 'E2E Cascade Novel')`;
      await tx`
        INSERT INTO chapter_publications (project_id, chapter, published_ordinal, title, content_hash) VALUES (${projectId}, 1, 1, 'Chapter One', 'e2e-hash-cascade')
      `;
      await tx`DELETE FROM projects WHERE id = ${projectId}`;
      const [publications] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM publications WHERE project_id = ${projectId}`;
      const [chapterPublications] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM chapter_publications WHERE project_id = ${projectId}`;
      return { publications: publications?.count ?? -1, chapterPublications: chapterPublications?.count ?? -1 };
    });
    expect(result).toEqual({ publications: 0, chapterPublications: 0 });
  });
});

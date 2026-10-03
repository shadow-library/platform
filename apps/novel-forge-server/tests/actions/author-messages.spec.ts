import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { authorMessagesFor } from '@modules/actions/plan-job.service';

const dialect = new PgDialect();

function fakeDb(answered: { sessionId: string } | undefined) {
  const messageReads: SQL[] = [];
  const db = {
    query: {
      chatMessages: {
        findFirst: async () => answered,
        findMany: async (query: { where: SQL }) => {
          messageReads.push(query.where);
          return [{ content: 'Plan chapter 4: the tide turns.' }];
        },
      },
      refinementProposals: { findFirst: async () => undefined },
    },
  };
  return { db: db as never, messageReads };
}

describe('authorMessagesFor', () => {
  it('should read the author’s words in the chat the answered message is in, after the card moved to another chat', async () => {
    const { db, messageReads } = fakeDb({ sessionId: 'original-chat' });

    const messages = await authorMessagesFor(db, { sessionId: 'adopting-chat', messageId: 12n, proposalId: 40n });

    expect(messages).toEqual(['Plan chapter 4: the tide turns.']);
    const { params } = dialect.sqlToQuery(messageReads[0] as SQL);
    expect(params).toContain('original-chat');
    expect(params).not.toContain('adopting-chat');
  });

  it('should read nothing for a card that answered no message', async () => {
    const { db, messageReads } = fakeDb({ sessionId: 'original-chat' });

    expect(await authorMessagesFor(db, { sessionId: 'adopting-chat', messageId: null, proposalId: 40n })).toEqual([]);
    expect(messageReads).toEqual([]);
  });

  it('should read nothing when the answered message is gone', async () => {
    const { db } = fakeDb(undefined);

    expect(await authorMessagesFor(db, { sessionId: 'adopting-chat', messageId: 12n, proposalId: 40n })).toEqual([]);
  });
});

import { describe, expect, it } from 'bun:test';

import { NOTES_MAX_WORDS, notesOffer, NotesStoreService, notesWithAppended } from '@modules/notes';
import { serialiseMessage } from '@modules/refinement/serialise';

const words = (count: number, word = 'salt') => Array.from({ length: count }, () => word).join(' ');
const LONG = words(600);

describe('notesOffer', () => {
  it('should offer a message of the author’s of 600 words or more, and nothing shorter or not theirs', () => {
    const offers = notesOffer('');

    expect(offers({ role: 'user', content: LONG })).toBe(true);
    expect(offers({ role: 'user', content: words(599) })).toBe(false);
    expect(offers({ role: 'assistant', content: LONG })).toBe(false);
  });

  it('should stop offering a message the notes already hold, or one they could not take within their word limit', () => {
    expect(notesOffer(`Earlier notes.\n\n${LONG}`)({ role: 'user', content: LONG })).toBe(false);
    expect(notesOffer(words(NOTES_MAX_WORDS - 599, 'tide'))({ role: 'user', content: LONG })).toBe(false);
    expect(notesOffer(words(NOTES_MAX_WORDS - 600, 'tide'))({ role: 'user', content: LONG })).toBe(true);
  });

  it('should reach the chat as the flag on the message', () => {
    const message = { id: 1n, sessionId: 's', ordinal: 1, role: 'user', content: LONG, createdAt: new Date(0) };

    expect(serialiseMessage(message).offersNotes).toBe(true);
    expect(serialiseMessage(message, notesOffer(LONG)).offersNotes).toBe(false);
  });
});

describe('notesWithAppended', () => {
  it('should append the text as paragraphs of its own, start the notes when there are none, and add nothing twice', () => {
    expect(notesWithAppended('Ilse carries letters.', `  ${LONG} `)).toBe(`Ilse carries letters.\n\n${LONG}`);
    expect(notesWithAppended('', LONG)).toBe(LONG);
    expect(notesWithAppended(`Ilse carries letters.\n\n${LONG}`, LONG)).toBeNull();
  });
});

describe('NotesStoreService.saveMessage', () => {
  function storeOver(message: { content: string } | undefined, notes: { id: bigint; statement: string } | undefined) {
    const calls: { kind: string; args: unknown[] }[] = [];
    const locks: unknown[] = [];
    let reads = 0;
    const found = (rows: unknown[]) => Object.assign(Promise.resolve(rows), { limit: async () => rows, for: async () => rows });
    const db = {
      select: () => ({ from: () => ({ where: () => found((reads++ === 0 ? [message] : [notes]).filter(Boolean)) }) }),
      execute: async (chunk: unknown) => void locks.push(chunk),
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    };
    const ledger = {
      supersede: async (...args: unknown[]) => void calls.push({ kind: 'supersede', args }),
      append: async (...args: unknown[]) => void calls.push({ kind: 'append', args }),
    };
    return { store: new NotesStoreService({ getPostgresClient: () => db } as never, ledger as never), calls, locks };
  }

  it('should append a long message to the notes as a successor, under the notes lock', async () => {
    const { store, calls, locks } = storeOver({ content: LONG }, { id: 5n, statement: 'Ilse carries letters.' });

    expect(await store.saveMessage(7n, 's', 3n)).toEqual({ saved: true, paragraphs: 2, words: 603 });
    expect(locks).toHaveLength(1);
    expect(calls).toEqual([{ kind: 'supersede', args: [7n, 5n, { kind: 'direction', statement: `Ilse carries letters.\n\n${LONG}`, decidedBy: 'author' }, expect.anything()] }]);
  });

  it('should start the notes from the message when there are none yet', async () => {
    const { store, calls } = storeOver({ content: LONG }, undefined);

    await store.saveMessage(7n, 's', 3n);

    expect(calls).toEqual([{ kind: 'append', args: [7n, [{ kind: 'direction', topic: 'start.brief', statement: LONG, decidedBy: 'author' }], expect.anything()] }]);
  });

  it('should refuse a short message, one not the author’s own, and notes it would take past their word limit; and change nothing when saved twice', async () => {
    await expect(storeOver({ content: 'short' }, undefined).store.saveMessage(7n, 's', 3n)).rejects.toMatchObject({ code: 'NTS_006' });
    await expect(storeOver(undefined, undefined).store.saveMessage(7n, 's', 3n)).rejects.toMatchObject({ code: 'NTS_005' });
    await expect(storeOver({ content: LONG }, { id: 5n, statement: words(NOTES_MAX_WORDS, 'tide') }).store.saveMessage(7n, 's', 3n)).rejects.toMatchObject({ code: 'PRJ_012' });

    const again = storeOver({ content: LONG }, { id: 5n, statement: LONG });
    expect(await again.store.saveMessage(7n, 's', 3n)).toEqual({ saved: false, paragraphs: 1, words: 600 });
    expect(again.calls).toEqual([]);
  });
});

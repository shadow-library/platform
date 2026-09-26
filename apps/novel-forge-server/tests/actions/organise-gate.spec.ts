import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { assertNotesUnorganised } from '@modules/actions/action-jobs';
import { inputScreens } from '@modules/ai/hard-line';
import { earlierParts, organiseContext, organisePasses } from '@modules/notes';

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

describe('organisePasses', () => {
  const paragraph = (words: number) => Array.from({ length: words }, () => 'salt').join(' ');

  it('should keep short notes to one pass and split long ones on whole paragraphs, numbered as the notes are', () => {
    expect(organisePasses([paragraph(500), paragraph(500)].join('\n\n')).map(pass => [pass.first, pass.last])).toEqual([[1, 2]]);
    expect(organisePasses([paragraph(1_800), paragraph(1_800), paragraph(900), paragraph(4_000)].join('\n\n')).map(pass => [pass.first, pass.last])).toEqual([
      [1, 1],
      [2, 3],
      [4, 4],
    ]);
  });

  it('should number each pass’s paragraphs from where it starts and say which part it is', () => {
    const notes = [paragraph(2_000), 'Ilse carries sealed letters.', paragraph(2_000)].join('\n\n');
    const [, second] = organisePasses(notes);
    const earlier = earlierParts([
      { reading: 'A courier story.', records: [{ name: 'Ilse', type: 'character' }], pages: [{ section: 'project', slug: 'cast' }], questions: [{ question: 'Who sent it?' }] },
    ]);
    const context = organiseContext([ledgerEntry({ topic: 'start.brief', statement: notes })], second, 2, earlier);

    expect(context.authorNotes).toContain('[¶3] salt');
    expect(context.authorNotes).not.toContain('Ilse carries');
    expect(context.volatileContext).toContain('this is ¶3–¶3 of 3. Organise only these paragraphs. How the earlier parts read: A courier story.');
    expect(context.volatileContext).toContain('Records named in earlier parts, to use under the same name and type: Ilse (character).');
    expect(context.volatileContext).toContain('Pages earlier parts wrote, to add to at the same address: project/cast.');
    expect(context.volatileContext).toContain('Questions earlier parts already asked, not to ask again: Who sent it?.');
  });
});

describe('assertNotesUnorganised', () => {
  function gateOver(organised: { id: bigint }[]) {
    const wheres: SQL[] = [];
    const db = { select: () => ({ from: () => ({ where: (where: SQL) => (wheres.push(where), { limit: async () => organised }) }) }) };
    return { db, wheres };
  }

  it('should refuse while an organise card waits, or a legacy card applied before cards recorded what they wrote', async () => {
    const { db, wheres } = gateOver([{ id: 42n }]);

    await expect(assertNotesUnorganised(db as never, 1n)).rejects.toMatchObject({ code: 'NTS_004' });
    const query = dialect.sqlToQuery(wheres[0] as SQL);
    expect(query.sql).toContain(
      `("refinement_proposals"."status" = $3 or ("refinement_proposals"."status" = $4 and "refinement_proposals"."organise_record"->>'legacy' = 'true'))`,
    );
    expect(query.params).toEqual([1n, 'organise', 'pending', 'applied']);
  });

  it('should let organising start beside an applied organise proposal that carries its record, whenever it was applied', async () => {
    const { db, wheres } = gateOver([]);

    await expect(assertNotesUnorganised(db as never, 1n)).resolves.toBeUndefined();
    expect(dialect.sqlToQuery(wheres[0] as SQL).sql).not.toContain('created_at');
  });
});

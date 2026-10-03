import { describe, expect, it } from 'bun:test';

import { HUB_ALLOWED_OPS } from '@modules/ai/prompts/scope-playbooks';
import { passageHash } from '@modules/generation/passage-anchor';
import { ideaIdOf } from '@modules/refinement/idea-id';
import {
  ActionExecutorRegistry,
  anchorPassageRewrites,
  type ChangeOp,
  type DraftRewritePassageOp,
  droppedRewritesNote,
  ProposalApplyService,
  ProposalService,
  rewrittenBody,
  stampPassageAnchors,
} from '@modules/refinement';
import { type Generation, type Refinement, schema } from '@server/database';

import { draftTables } from '../generation/draft-tables';

type Row = Record<string, unknown>;

const BODY = [
  'The salle smelled of chalk. Again, the light came in bars.',
  'Corin flexed his right hand until the knuckles stopped aching.',
  '“Again,” Mara said.',
  'He was afraid of her, and he knew it.',
].join('\n\n');
const WRIST = 'flexed his right hand until the knuckles stopped aching.';
const WRIST_REWRITE = 'worked his right wrist in slow circles until the old break stopped grinding.';
const FEAR = 'He was afraid of her, and he knew it.';
const FEAR_REWRITE = 'His grip had gone damp inside the glove.';
const SECOND_AGAIN = BODY.lastIndexOf('Again');

function rewrite(passage: string, replacement: string, extra: Partial<DraftRewritePassageOp> = {}): DraftRewritePassageOp {
  return { op: 'draft.rewrite_passage', chapter: 3, passage, replacement, ...extra };
}

function comment(quote: string, overrides: Partial<Refinement.ChatPassageContext> = {}): Refinement.ChatPassageContext {
  const start = BODY.indexOf(quote);
  return {
    kind: 'passage',
    chapter: 3,
    draftId: '3',
    revision: 1,
    saveSeq: 0,
    start,
    end: start + quote.length,
    passageHash: passageHash(quote),
    quote,
    comment: 'Make it sharper.',
    firstParagraph: 3,
    lastParagraph: 3,
    ...overrides,
  };
}

/** Chapter 3 holds BODY at revision 1 and is still a draft; chapter 2 is canon behind the story cursor. */
function workspace(chapter3: Row = {}) {
  return draftTables({
    drafts: [
      { id: 2n, chapter: 2, body: 'Two.', revision: 4, status: 'final' },
      { id: 3n, chapter: 3, body: BODY, revision: 1, saveSeq: 0, generator: 'standard', ...chapter3 },
      { id: 5n, chapter: 5, body: 'Five.', revision: 1, isolated: true, generator: 'unrestricted' },
      { id: 6n, chapter: 6, body: 'Six.', revision: 1, reviewStatus: 'generating' },
    ],
    revisions: [{ draftId: 3n, revision: 1, source: 'generated', body: BODY }],
    storyCurrentChapter: 2,
  });
}

function anchored(ops: ChangeOp[], contexts: Refinement.ChatPassageContext[] = [], tables = workspace()) {
  return anchorPassageRewrites(tables.db as never, 7n, ops, contexts);
}

describe('anchorPassageRewrites', () => {
  it('should anchor a passage that occurs once to the draft as it stands, whatever anchor the model sent', async () => {
    const sent = { draftId: '99', revision: 9, saveSeq: 9, start: 0, end: 4, passageHash: 'x', paragraph: 1, contextBefore: '', contextAfter: '' };

    const { ops, dropped } = await anchored([rewrite(WRIST, WRIST_REWRITE, { label: 'the wrist injury', anchor: sent })]);

    const start = BODY.indexOf(WRIST);
    expect(dropped).toEqual([]);
    expect(ops).toEqual([
      {
        ...rewrite(WRIST, WRIST_REWRITE, { label: 'the wrist injury' }),
        anchor: {
          draftId: '3',
          revision: 1,
          saveSeq: 0,
          start,
          end: start + WRIST.length,
          passageHash: passageHash(WRIST),
          paragraph: 2,
          contextBefore: BODY.slice(start - 32, start),
          contextAfter: BODY.slice(start + WRIST.length, start + WRIST.length + 32),
        },
      },
    ]);
  });

  it('should keep the passage’s own surrounding whitespace around the replacement', async () => {
    const { ops } = await anchored([rewrite(`\n\n${FEAR}`, `  ${FEAR_REWRITE}\n`)]);

    expect(ops[0]).toMatchObject({ passage: `\n\n${FEAR}`, replacement: `\n\n${FEAR_REWRITE}`, anchor: { paragraph: 4 } });
  });

  it('should leave every other op as it was, in its place', async () => {
    const brief: ChangeOp = { op: 'brief.update', chapter: 4, title: 'The Bout' };

    const { ops } = await anchored([brief, rewrite(WRIST, WRIST_REWRITE)]);

    expect(ops[0]).toBe(brief);
    expect(ops[1]).toMatchObject({ op: 'draft.rewrite_passage' });
  });

  it.each([
    ['words the chapter does not hold', rewrite('flexed his left hand', 'shook his hand'), 'not_found'],
    ['words that occur twice with no comment to tell them apart', rewrite('Again', 'Once more'), 'ambiguous'],
  ] as const)('should drop a rewrite of %s rather than guess', async (_, op, reason) => {
    const { ops, dropped } = await anchored([op]);

    expect(ops).toEqual([]);
    expect(dropped).toEqual([{ chapter: 3, reason }]);
  });

  it('should tell a repeated passage apart by the comment it answers', async () => {
    const contexts = [comment('He was afraid of her'), comment('“Again,” Mara said.')];

    const { ops } = await anchored([rewrite('Again', 'Once more', { contextIndex: 2 })], contexts);

    expect(ops[0]).toMatchObject({ contextIndex: 2, anchor: { start: SECOND_AGAIN, end: SECOND_AGAIN + 'Again'.length, paragraph: 3 } });
  });

  it('should tell a repeated passage apart by the turn’s comments on its chapter when it names none', async () => {
    const { ops } = await anchored([rewrite('Again', 'Once more')], [comment('“Again,” Mara said.')]);

    expect(ops[0]).toMatchObject({ anchor: { start: SECOND_AGAIN } });
  });

  it('should not tell a repeated passage apart by a comment made on an earlier read of the draft', async () => {
    const { dropped } = await anchored([rewrite('Again', 'Once more', { contextIndex: 1 })], [comment('“Again,” Mara said.', { saveSeq: 3 })], workspace({ saveSeq: 4 }));

    expect(dropped).toEqual([{ chapter: 3, reason: 'ambiguous' }]);
  });

  it('should drop a contextIndex that names no comment on the rewrite’s chapter', async () => {
    const { ops } = await anchored([rewrite(WRIST, WRIST_REWRITE, { contextIndex: 2 })], [comment('He was afraid of her', { chapter: 4 })]);

    expect(ops[0]).not.toHaveProperty('contextIndex');
  });

  it('should find a quote spanning paragraphs that was copied with the comment block’s indentation', async () => {
    const quoted = '“Again,” Mara said.\n   \n   He was afraid of her';

    const { ops } = await anchored([rewrite(quoted, 'Mara said nothing.')]);

    expect(ops[0]).toMatchObject({ passage: '“Again,” Mara said.\n\nHe was afraid of her', anchor: { start: BODY.indexOf('“Again') } });
  });

  it('should match a passage written with Windows line endings against the stored prose', async () => {
    const { ops } = await anchored([rewrite('“Again,” Mara said.\r\n\r\nHe was', 'She waited.\r\n\r\nHe was')]);

    expect(ops[0]).toMatchObject({ passage: '“Again,” Mara said.\n\nHe was', replacement: 'She waited.\n\nHe was' });
  });

  it.each([
    ['a chapter behind the story cursor', 2, 'locked'],
    ['an isolated chapter', 5, 'isolated'],
    ['a chapter being written', 6, 'generating'],
    ['a chapter with no draft', 9, 'no_draft'],
  ] as const)('should drop a rewrite of %s', async (_, chapter, reason) => {
    const { dropped } = await anchored([rewrite('Two.', 'Three.', { chapter, label: 'the count' })]);

    expect(dropped).toEqual([{ chapter, label: 'the count', reason }]);
  });

  it('should drop a rewrite of a draft that turned final ahead of the story cursor', async () => {
    const { dropped } = await anchored([rewrite(WRIST, WRIST_REWRITE)], [], workspace({ status: 'final' }));

    expect(dropped).toEqual([{ chapter: 3, reason: 'locked' }]);
  });

  it('should drop the rewrites of a chapter the same reply rewrites whole', async () => {
    const whole: ChangeOp = { op: 'draft.update', chapter: 3, body: 'A new chapter.' };

    const { ops, dropped } = await anchored([rewrite(WRIST, WRIST_REWRITE), whole]);

    expect(ops).toEqual([whole]);
    expect(dropped).toEqual([{ chapter: 3, reason: 'whole_chapter' }]);
  });

  it('should drop a rewrite that changes nothing and keep one copy of a repeated rewrite', async () => {
    const { ops, dropped } = await anchored([rewrite(WRIST, ` ${WRIST} `), rewrite(FEAR, FEAR_REWRITE), rewrite(FEAR, FEAR_REWRITE)]);

    expect(ops).toHaveLength(1);
    expect(dropped).toEqual([{ chapter: 3, reason: 'unchanged' }]);
  });

  it('should drop a passage longer than a rewrite may take', async () => {
    const { dropped } = await anchored([rewrite('x'.repeat(6001), 'y')]);

    expect(dropped).toEqual([{ chapter: 3, reason: 'too_long' }]);
  });
});

describe('a rewrite’s idea', () => {
  it('should keep the same idea id whichever read of the draft anchored it', async () => {
    const [first] = (await anchored([rewrite(WRIST, WRIST_REWRITE)])).ops;
    const [moved] = (await anchored([rewrite(WRIST, WRIST_REWRITE)], [], workspace({ body: `Dawn.\n\n${BODY}`, saveSeq: 2 }))).ops;

    expect(ideaIdOf(first as ChangeOp)).toBe(ideaIdOf(moved as ChangeOp));
    expect(ideaIdOf(first as ChangeOp)).not.toBe(ideaIdOf(rewrite(WRIST, FEAR_REWRITE)));
  });
});

describe('droppedRewritesNote', () => {
  it('should say nothing when nothing was dropped', () => {
    expect(droppedRewritesNote([])).toBeUndefined();
  });

  it('should name each rewrite left out and why', () => {
    const note = droppedRewritesNote([
      { chapter: 3, label: 'the wrist injury', reason: 'ambiguous' },
      { chapter: 2, reason: 'locked' },
    ]);

    expect(note).toBe(
      [
        'Forge left out 2 passage rewrites:',
        '- “the wrist injury” in chapter 3: its words occur more than once in the chapter — select the passage and ask again.',
        '- A passage in chapter 2: the chapter is final, so its prose changes only through Amend.',
      ].join('\n'),
    );
  });
});

describe('stampPassageAnchors', () => {
  it('should keep the occurrence a still-holding anchor names', async () => {
    const { ops } = await anchored([rewrite('Again', 'Once more', { contextIndex: 1 })], [comment('“Again,” Mara said.')]);

    const [stamped] = await stampPassageAnchors(workspace().db as never, 7n, ops);

    expect(stamped).toEqual(ops[0]);
  });

  it('should anchor afresh a passage that moved but still occurs once', async () => {
    const { ops } = await anchored([rewrite(FEAR, FEAR_REWRITE)]);
    const moved = `Dawn.\n\n${BODY}`;

    const [stamped] = await stampPassageAnchors(workspace({ body: moved, saveSeq: 1 }).db as never, 7n, ops);

    expect(stamped).toMatchObject({ anchor: { saveSeq: 1, start: moved.indexOf(FEAR), paragraph: 5 } });
  });

  it('should keep a repeated passage its anchor still finds after an edit elsewhere moved it', async () => {
    const { ops } = await anchored([rewrite('Again', 'Once more', { contextIndex: 1 })], [comment('“Again,” Mara said.')]);
    const moved = `Dawn.\n\n${BODY}`;

    const [stamped] = await stampPassageAnchors(workspace({ body: moved, saveSeq: 1 }).db as never, 7n, ops);

    expect(stamped).toMatchObject({ anchor: { saveSeq: 1, start: moved.lastIndexOf('Again'), paragraph: 4 } });
  });

  it('should refuse a chapter rewritten whole beside its passage rewrites', async () => {
    const { ops } = await anchored([rewrite(WRIST, WRIST_REWRITE)]);

    await expect(stampPassageAnchors(workspace().db as never, 7n, [...ops, { op: 'draft.update', chapter: 3, body: 'New.' }])).rejects.toMatchObject({ code: 'RFN_004' });
  });

  it('should refuse a rewrite it cannot place on its own, rather than guess', async () => {
    await expect(stampPassageAnchors(workspace().db as never, 7n, [rewrite('Again', 'Once more')])).rejects.toMatchObject({ code: 'RFN_004' });
  });

  it('should pass a change-set without rewrites through untouched, reading nothing', async () => {
    const ops: ChangeOp[] = [{ op: 'brief.update', chapter: 4, title: 'The Bout' }];

    expect(await stampPassageAnchors({} as never, 7n, ops)).toBe(ops);
  });
});

describe('rewrittenBody', () => {
  const draft = { id: 3n, chapter: 3, revision: 1, saveSeq: 0, body: BODY } as Generation.Draft;
  const staged = async (...ops: DraftRewritePassageOp[]) => (await anchored(ops)).ops as DraftRewritePassageOp[];

  it('should write every rewrite from the end of the text back, so each anchor still holds', async () => {
    const ops = await staged(rewrite(WRIST, WRIST_REWRITE), rewrite(FEAR, FEAR_REWRITE));

    expect(rewrittenBody(draft, ops)).toBe(BODY.replace(WRIST, WRIST_REWRITE).replace(FEAR, FEAR_REWRITE));
  });

  it('should write rewrites that only touch end to start', async () => {
    const ops = await staged(rewrite('Corin flexed', 'Corin rolled'), rewrite(' his right hand', ' his wrist'));

    expect(rewrittenBody(draft, ops)).toContain('Corin rolled his wrist until');
  });

  it('should refuse two rewrites of the same words', async () => {
    const ops = await staged(rewrite('flexed his right hand', 'rolled his wrist'), rewrite('his right hand until', 'his hand till'));

    expect(() => rewrittenBody(draft, ops)).toThrow(expect.objectContaining({ code: 'RFN_020' }));
  });

  it('should write each rewrite where an edit elsewhere in the chapter moved it', async () => {
    const ops = await staged(rewrite(WRIST, WRIST_REWRITE), rewrite(FEAR, FEAR_REWRITE));
    const moved = { ...draft, revision: 2, saveSeq: 3, body: `Dawn.\n\n${BODY}` };

    expect(rewrittenBody(moved, ops)).toBe(`Dawn.\n\n${BODY.replace(WRIST, WRIST_REWRITE).replace(FEAR, FEAR_REWRITE)}`);
  });

  it.each([
    ['its words were edited', BODY.replace('knuckles stopped', 'knuckles finally stopped')],
    ['the words beside it were edited', BODY.replace('Corin flexed', 'Corin slowly flexed')],
    ['it moved and now occurs twice with its surroundings', `Dawn.\n\n${BODY}\n\n${BODY}`],
  ])('should refuse a rewrite, naming it, when %s', async (_, body) => {
    const ops = await staged(rewrite(WRIST, WRIST_REWRITE, { label: 'the wrist injury' }));

    expect(() => rewrittenBody({ ...draft, saveSeq: 1, body }, ops)).toThrow(
      expect.objectContaining({ code: 'RFN_021', message: expect.stringContaining('“the wrist injury” in chapter 3') }),
    );
  });

  it('should name an unlabelled rewrite by its paragraph, and refuse one whose draft was replaced', async () => {
    const ops = await staged(rewrite(WRIST, WRIST_REWRITE));

    expect(() => rewrittenBody({ ...draft, id: 30n }, ops)).toThrow(expect.objectContaining({ code: 'RFN_021', message: expect.stringContaining('¶2 in chapter 3') }));
  });

  it('should leave a rewrite in place when only a copy of its words appears elsewhere', async () => {
    const ops = await staged(rewrite(WRIST, WRIST_REWRITE));

    expect(rewrittenBody({ ...draft, body: `${BODY}\n\n${WRIST}` }, ops)).toBe(`${BODY.replace(WRIST, WRIST_REWRITE)}\n\n${WRIST}`);
  });
});

const SESSION = '11111111-1111-4111-8111-111111111111';

async function stage(tables: ReturnType<typeof workspace>, ops: ChangeOp[]): Promise<{ row: Row; id: bigint }> {
  const service = new ProposalService({ getPostgresClient: () => tables.db } as never);
  const proposal = await service.create(7n, { sessionId: SESSION, scopeType: 'project', kind: 'hub', changeSet: ops, allowedOps: HUB_ALLOWED_OPS, warnings: [] });
  const row = tables.rows(schema.refinementProposals).find(candidate => candidate['id'] === proposal.id) as Row;
  row['status'] = 'pending';
  return { row, id: proposal.id };
}

describe('ProposalService superseding a chat’s passage rewrite cards', () => {
  it('should keep an earlier card that rewrites another passage of the same chapter', async () => {
    const tables = workspace();
    const first = await stage(tables, [rewrite(WRIST, WRIST_REWRITE)]);

    await stage(tables, [rewrite(FEAR, FEAR_REWRITE)]);

    expect(first.row['status']).toBe('pending');
  });

  it('should replace an earlier card that rewrites the same words', async () => {
    const tables = workspace();
    const first = await stage(tables, [rewrite(WRIST, WRIST_REWRITE)]);

    await stage(tables, [rewrite('his right hand', 'his wrist')]);

    expect(first.row['status']).toBe('superseded');
  });

  it('should replace an earlier card whose passage no longer stands', async () => {
    const tables = workspace();
    const first = await stage(tables, [rewrite(WRIST, WRIST_REWRITE)]);
    Object.assign(tables.draft(3) as Row, { body: BODY.replace('knuckles stopped', 'knuckles finally stopped'), saveSeq: 1 });

    await stage(tables, [rewrite(FEAR, FEAR_REWRITE)]);

    expect(first.row['status']).toBe('superseded');
  });

  it('should replace an earlier rewrite card with a whole-chapter edit, and a whole-chapter card with a rewrite', async () => {
    const tables = workspace();
    const rewriteCard = await stage(tables, [rewrite(WRIST, WRIST_REWRITE)]);
    const wholeCard = await stage(tables, [{ op: 'draft.update', chapter: 3, title: 'The Second Bout' }]);
    expect(rewriteCard.row['status']).toBe('superseded');

    await stage(tables, [rewrite(FEAR, FEAR_REWRITE)]);

    expect(wholeCard.row['status']).toBe('superseded');
  });
});

describe('ProposalApplyService passage rewrites', () => {
  async function staged(ops: ChangeOp[], chapter3: Row = {}) {
    const tables = workspace(chapter3);
    const { row, id } = await stage(tables, ops);
    const applier = new ProposalApplyService({ getPostgresClient: () => tables.db } as never, new ActionExecutorRegistry());
    return { tables, row, id, applier };
  }
  const bothRewrites = [rewrite(WRIST, WRIST_REWRITE, { label: 'the wrist injury' }), rewrite(FEAR, FEAR_REWRITE, { label: 'show the fear' })];
  const rewritten = BODY.replace(WRIST, WRIST_REWRITE).replace(FEAR, FEAR_REWRITE);

  it('should stage each rewrite with its anchor and the draft’s baseline', async () => {
    const { row } = await staged(bothRewrites);

    expect(row['changeSet']).toMatchObject([{ anchor: { paragraph: 2 } }, { anchor: { paragraph: 4 } }]);
    expect(Object.keys(row['baseline'] as Row)).toEqual(['draft:3']);
  });

  it('should write every selected rewrite of a chapter as one passage_rewritten revision', async () => {
    const { tables, id, applier } = await staged(bothRewrites);

    const result = await applier.apply(7n, id, { opIndexes: [0, 1] });

    expect(tables.draft(3)).toMatchObject({ body: rewritten, revision: 2, saveSeq: 1, reviewStatus: 'needs_review' });
    expect(tables.revisionsOf(3).map(revision => [revision['revision'], revision['source']])).toEqual([
      [1, 'generated'],
      [2, 'passage_rewritten'],
    ]);
    expect(result.applied).toEqual([{ artifactRef: 'draft:3', newRevision: 2, newSaveSeq: 1, newDraftId: 3n }]);
    expect(result.opResults.map(entry => entry.status)).toEqual(['applied', 'applied']);
  });

  it('should write only the rewrites the author kept', async () => {
    const { tables, id, applier } = await staged(bothRewrites);

    const result = await applier.apply(7n, id, { opIndexes: [1] });

    expect(tables.draft(3)?.['body']).toBe(BODY.replace(FEAR, FEAR_REWRITE));
    expect(result.opResults.map(entry => entry.status)).toEqual(['declined', 'applied']);
  });

  it('should refuse two selected rewrites of the same words, writing nothing', async () => {
    const { tables, id, applier } = await staged([rewrite('flexed his right hand', 'rolled his wrist'), rewrite('his right hand until', 'his hand till')]);

    await expect(applier.apply(7n, id, { opIndexes: [0, 1] })).rejects.toMatchObject({ code: 'RFN_020' });
    expect(tables.draft(3)).toMatchObject({ body: BODY, revision: 1 });
    expect(tables.revisionsOf(3)).toHaveLength(1);
  });

  it('should apply at the shifted offsets after a hand edit elsewhere in the chapter', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    Object.assign(tables.draft(3) as Row, { body: `Dawn.\n\n${BODY}`, revision: 2, saveSeq: 1 });

    await applier.apply(7n, id, { opIndexes: [0, 1] });

    expect(tables.draft(3)).toMatchObject({ body: `Dawn.\n\n${rewritten}`, revision: 3 });
  });

  it('should apply after a save that changed only the summary', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    Object.assign(tables.draft(3) as Row, { summary: 'Corin loses the first touch.', saveSeq: 1 });

    await applier.apply(7n, id, { opIndexes: [0, 1] });

    expect(tables.draft(3)).toMatchObject({ body: rewritten, summary: 'Corin loses the first touch.' });
  });

  it('should refuse a rewrite whose passage was edited, leaving the card pending so the others still apply', async () => {
    const { tables, row, id, applier } = await staged(bothRewrites);
    const edited = BODY.replace('knuckles stopped', 'knuckles finally stopped');
    Object.assign(tables.draft(3) as Row, { body: edited, saveSeq: 1 });

    await expect(applier.apply(7n, id, { opIndexes: [0, 1] })).rejects.toMatchObject({ code: 'RFN_021' });
    expect(row['status']).toBe('pending');
    expect(tables.draft(3)?.['body']).toBe(edited);

    await applier.apply(7n, id, { opIndexes: [1] });
    expect(tables.draft(3)?.['body']).toBe(edited.replace(FEAR, FEAR_REWRITE));
  });

  it('should mark the card conflicted when the draft is gone', async () => {
    const { tables, row, id, applier } = await staged(bothRewrites);
    tables.rows(schema.drafts).splice(tables.rows(schema.drafts).indexOf(tables.draft(3) as Row), 1);

    await expect(applier.apply(7n, id, { opIndexes: [0] })).rejects.toMatchObject({ code: 'RFN_003' });
    expect(row['status']).toBe('conflicted');
  });

  it.each([
    ['final', { status: 'final' }, 'RFN_010'],
    ['isolated', { isolated: true }, 'RFN_012'],
    ['generating', { reviewStatus: 'generating' }, 'DRF_019'],
  ] as const)('should refuse a draft that turned %s after the card was staged', async (_, change, code) => {
    const { tables, id, applier } = await staged(bothRewrites);
    Object.assign(tables.draft(3) as Row, change);

    await expect(applier.apply(7n, id, { opIndexes: [0] })).rejects.toMatchObject({ code });
    expect(tables.draft(3)?.['body']).toBe(BODY);
  });

  it('should never apply a rewrite automatically', async () => {
    const { id, applier } = await staged(bothRewrites);

    await expect(applier.apply(7n, id, { autoApplied: true })).rejects.toThrow('the write policy keeps it a card');
  });

  it('should put the prior body back when the applied card is reverted', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    await applier.apply(7n, id, { opIndexes: [0, 1] });

    await applier.revert(7n, id);

    expect(tables.draft(3)).toMatchObject({ body: BODY, revision: 3 });
    expect(tables.revisionsOf(3).at(-1)).toMatchObject({ revision: 3, source: 'chat_edited', body: BODY });
  });

  it('should put back the body as it stood before a relocated apply, the edit elsewhere included', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    Object.assign(tables.draft(3) as Row, { body: `Dawn.\n\n${BODY}`, revision: 2, saveSeq: 1 });
    await applier.apply(7n, id, { opIndexes: [0, 1] });

    await applier.revert(7n, id);

    expect(tables.draft(3)?.['body']).toBe(`Dawn.\n\n${BODY}`);
  });

  it('should keep an autosave that committed just before the apply locked the draft when the card is reverted', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    const autosaved = `Dawn.\n\n${BODY}`;
    const select = tables.db.select;
    let autosaveLanded = false;
    tables.db.select = (selection?: Row) => {
      const query = select(selection);
      return {
        from: (table: unknown) => ({
          where: (where: Parameters<ReturnType<typeof query.from>['where']>[0]) => {
            const filtered = query.from(table).where(where);
            const lock = async () => {
              if (table === schema.drafts && !autosaveLanded) {
                autosaveLanded = true;
                Object.assign(tables.draft(3) as Row, { body: autosaved, saveSeq: 1 });
              }
              return filtered.for();
            };
            return { ...filtered, for: lock };
          },
        }),
      };
    };
    await applier.apply(7n, id, { opIndexes: [0, 1] });
    expect(tables.draft(3)?.['body']).toBe(`Dawn.\n\n${rewritten}`);

    await applier.revert(7n, id);

    expect(autosaveLanded).toBe(true);
    expect(tables.draft(3)?.['body']).toBe(autosaved);
  });

  it('should refuse the revert once the chapter was edited after the rewrite', async () => {
    const { tables, id, applier } = await staged(bothRewrites);
    await applier.apply(7n, id, { opIndexes: [0, 1] });
    Object.assign(tables.draft(3) as Row, { body: `${rewritten}\n\nDawn.` });

    await expect(applier.revert(7n, id)).rejects.toMatchObject({ code: 'RFN_006' });
    expect(tables.draft(3)?.['body']).toBe(`${rewritten}\n\nDawn.`);
  });
});

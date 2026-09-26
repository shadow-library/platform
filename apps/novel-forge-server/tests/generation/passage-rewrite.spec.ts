import { describe, expect, it } from 'bun:test';

import { anchorContext, passageHash } from '@modules/generation/passage-anchor';
import { PassageRewriteService } from '@modules/generation/passage-rewrite.service';
import { DraftConflictError } from '@server/classes';
import { schema } from '@server/database';

import { TERM, writerTables } from '../ai/writer-disclosure-fixtures';
import { draftTables } from './draft-tables';

type Row = Record<string, unknown>;

const BODY = 'The keeper counts the ships. The tide turns late. The ferry waits.';
const PASSAGE = 'The tide turns late.';
const START = BODY.indexOf(PASSAGE);
const REWRITE = 'The tide holds its breath.';

interface Captured {
  meta: { role: string; draftRevision: number; chapter: number };
  messages: { role: string; content: string }[];
}

function suggestionRow(overrides: Row = {}): Row {
  return {
    id: 50n,
    projectId: 7n,
    draftId: 3n,
    chapter: 3,
    baseRevision: 2,
    baseSaveSeq: 0,
    anchorStart: START,
    anchorEnd: START + PASSAGE.length,
    passageHash: passageHash(PASSAGE),
    passage: PASSAGE,
    ...anchorContext(BODY, START, START + PASSAGE.length),
    isolated: false,
    request: 'Make it tense.',
    replacement: REWRITE,
    leakLines: [],
    status: 'open',
    appliedRevision: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

/** Chapter 3 holds BODY at revision 2; chapter 4 was written after it. */
function workspace(options: { chapter3?: Row; suggestions?: readonly Row[] } = {}) {
  const tables = draftTables({
    drafts: [
      { id: 3n, chapter: 3, body: BODY, revision: 2, generator: 'standard', ...options.chapter3 },
      { id: 4n, chapter: 4, body: 'Four.', revision: 1 },
    ],
    revisions: [{ draftId: 3n, revision: 2, source: 'generated', body: BODY }],
  });
  tables.rows(schema.passageSuggestions).push(...(options.suggestions ?? []));

  const captured: Captured[] = [];
  const modelInputs: Record<string, unknown>[] = [];
  const modelRouter = {
    structured: async (_prompt: unknown, vars: Record<string, unknown>, ctx: { onMessages?: (messages: Captured['messages'], route: unknown) => void }) => {
      modelInputs.push(vars);
      ctx.onMessages?.([{ role: 'human', content: `rewrite: ${String(vars['passage'])}` }], { provider: 'openrouter', model: 'test-writer-model' });
      return { replacement: `  ${REWRITE}\n` };
    },
  };
  const writerSnapshots = {
    onMessages: (meta: Captured['meta']) => (messages: Captured['messages']) => void captured.push({ meta, messages }),
  };
  const service = new PassageRewriteService(
    { getPostgresClient: () => tables.db } as never,
    modelRouter as never,
    { forChapter: async () => ({ id: null, rendered: '', omitted: null }) } as never,
    { resolve: async () => ({ raised: false }) } as never,
    writerSnapshots as never,
  );
  return { tables, service, captured, modelInputs };
}

const request = (overrides: Partial<{ start: number; end: number; passageHash: string; saveSeq: number }> = {}) => ({
  base: { draftId: 3n, revision: 2, saveSeq: overrides.saveSeq ?? 0 },
  start: overrides.start ?? START,
  end: overrides.end ?? START + PASSAGE.length,
  passageHash: overrides.passageHash ?? passageHash(PASSAGE),
  request: 'Make it tense.',
});

describe('PassageRewriteService.request', () => {
  it('should store a suggestion anchored to the revision, save sequence, offsets and hash it was asked on', async () => {
    const { tables, service } = workspace();

    const suggestion = await service.request(7n, 3, request());

    expect(suggestion).toMatchObject({ baseRevision: 2, baseSaveSeq: 0, anchorStart: START, anchorEnd: START + PASSAGE.length, passage: PASSAGE, replacement: REWRITE });
    expect(suggestion.location).toEqual({ freshness: 'fresh', start: START, end: START + PASSAGE.length });
    expect(tables.rows(schema.passageSuggestions)[0]).toMatchObject({
      draftId: 3n,
      passageHash: passageHash(PASSAGE),
      contextBefore: 'The keeper counts the ships. ',
      contextAfter: ' The ferry waits.',
      isolated: false,
    });
    expect(tables.draft(3)).toMatchObject({ body: BODY, revision: 2 });
  });

  it('should capture the attempt as a passage writer snapshot against the base revision', async () => {
    const { service, captured } = workspace();

    await service.request(7n, 3, request());

    expect(captured).toEqual([{ meta: expect.objectContaining({ role: 'passage', draftRevision: 2, chapter: 3 }), messages: [{ role: 'human', content: `rewrite: ${PASSAGE}` }] }]);
  });

  it('should mark the passage for the writer inside the whole chapter', async () => {
    const { service, modelInputs } = workspace();

    await service.request(7n, 3, request());

    expect(modelInputs[0]?.['draftBody']).toBe('The keeper counts the ships. [[PASSAGE]]The tide turns late.[[/PASSAGE]] The ferry waits.');
  });

  it('should refuse a final chapter with a reason before any model call', async () => {
    const { tables, service, modelInputs } = workspace({ chapter3: { status: 'final', reviewStatus: 'final' } });

    await expect(service.request(7n, 3, request())).rejects.toMatchObject({ code: 'PSG_006' });
    expect(modelInputs).toEqual([]);
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a selection whose text no longer hashes to the anchor', async () => {
    const { service, modelInputs } = workspace();

    await expect(service.request(7n, 3, request({ passageHash: passageHash('The tide turns early.') }))).rejects.toMatchObject({ code: 'PSG_003' });
    expect(modelInputs).toEqual([]);
  });

  it('should refuse a selection made against an older save of the draft', async () => {
    const { service } = workspace({ chapter3: { saveSeq: 3 } });

    const error = await service.request(7n, 3, request({ saveSeq: 2 })).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(DraftConflictError);
  });

  it('should refuse a selection outside the chapter', async () => {
    const { service } = workspace();

    await expect(service.request(7n, 3, request({ start: 10, end: BODY.length + 5 }))).rejects.toMatchObject({ code: 'PSG_002' });
  });
});

describe('PassageRewriteService.apply', () => {
  it('should apply a fresh suggestion as a new revision and close it', async () => {
    const { tables, service } = workspace({ suggestions: [suggestionRow()] });

    const { draft, suggestion } = await service.apply(7n, 3, 50n, undefined);

    expect(draft).toMatchObject({ revision: 3, body: 'The keeper counts the ships. The tide holds its breath. The ferry waits.', reviewStatus: 'needs_review' });
    expect(tables.revisionsOf(3).at(-1)).toMatchObject({ revision: 3, source: 'passage_rewritten' });
    expect(suggestion).toMatchObject({ status: 'applied', appliedRevision: 3 });
    expect(tables.draft(4)?.['staleReason']).toBe('ancestor chapter 3 had a passage rewritten');
  });

  it('should apply a moved passage where its hash re-locates it', async () => {
    const moved = `Night falls. ${BODY}`;
    const { service } = workspace({ chapter3: { body: moved, revision: 5, saveSeq: 2 }, suggestions: [suggestionRow()] });

    const { draft } = await service.apply(7n, 3, 50n, undefined);

    expect(draft.body).toBe('Night falls. The keeper counts the ships. The tide holds its breath. The ferry waits.');
  });

  it('should list a moved passage as stale when it can no longer be told apart', async () => {
    const { service } = workspace({ chapter3: { body: `Night falls. ${BODY} ${BODY}`, revision: 3 }, suggestions: [suggestionRow()] });

    const [listed] = await service.list(7n, 3);

    expect(listed?.location).toEqual({ freshness: 'stale', start: null, end: null });
  });

  it('should refuse to apply a passage whose surrounding text was edited, though its own words still stand', async () => {
    const edited = BODY.replace('the ships', 'the boats');
    const { tables, service } = workspace({ chapter3: { body: edited, revision: 3 }, suggestions: [suggestionRow()] });

    await expect(service.apply(7n, 3, 50n, undefined)).rejects.toMatchObject({ code: 'PSG_004' });
    expect(tables.writes).toEqual([]);
  });

  it('should keep a rewrite made on the unrestricted route contained when it is applied', async () => {
    const { tables, service } = workspace({ suggestions: [suggestionRow({ isolated: true })] });

    await service.apply(7n, 3, 50n, undefined);

    expect(tables.draft(3)).toMatchObject({ generator: 'unrestricted', isolated: true });
    expect(tables.revisionsOf(3).at(-1)).toMatchObject({ source: 'passage_rewritten', isolated: true });
  });

  it('should leave a standard chapter standard when a standard rewrite is applied', async () => {
    const { tables, service } = workspace({ suggestions: [suggestionRow()] });

    await service.apply(7n, 3, 50n, undefined);

    expect(tables.draft(3)).toMatchObject({ generator: 'standard' });
    expect(tables.draft(3)?.['isolated']).toBeFalsy();
  });

  it('should refuse to apply a stale suggestion, changing nothing', async () => {
    const edited = BODY.replace('turns late', 'turns early');
    const { tables, service } = workspace({ chapter3: { body: edited, revision: 3 }, suggestions: [suggestionRow()] });

    await expect(service.apply(7n, 3, 50n, undefined)).rejects.toMatchObject({ code: 'PSG_004' });
    expect(tables.writes).toEqual([]);
    expect(tables.draft(3)?.['body']).toBe(edited);
  });

  it('should refuse to apply on a final chapter with a reason', async () => {
    const { tables, service } = workspace({ chapter3: { status: 'final', reviewStatus: 'final' }, suggestions: [suggestionRow()] });

    await expect(service.apply(7n, 3, 50n, undefined)).rejects.toMatchObject({ code: 'PSG_006' });
    expect(tables.writes).toEqual([]);
  });

  it('should refuse a suggestion that was already applied', async () => {
    const { service } = workspace({ suggestions: [suggestionRow({ status: 'applied', appliedRevision: 3 })] });

    await expect(service.apply(7n, 3, 50n, undefined)).rejects.toMatchObject({ code: 'PSG_005' });
  });

  it('should refuse an apply made against an older save, so an unsaved edit is not overwritten', async () => {
    const { tables, service } = workspace({ chapter3: { saveSeq: 4 }, suggestions: [suggestionRow()] });

    const error = await service.apply(7n, 3, 50n, { draftId: 3n, revision: 2, saveSeq: 3 }).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(DraftConflictError);
    expect(tables.writes).toEqual([]);
  });
});

describe('PassageRewriteService.apply — locked secrets', () => {
  /** Chapter 5 of the disclosure fixture, where the lamp's price is still locked. */
  function lockedChapter(replacement: string) {
    const tables = draftTables({ drafts: [{ id: 5n, chapter: 5, body: BODY, revision: 2, generator: 'standard' }] });
    for (const [name, rows] of writerTables('locked')) {
      if (name === 'drafts') continue;
      const table = tables.rows((schema as unknown as Record<string, unknown>)[name]);
      table.splice(0, table.length, ...rows);
    }
    tables.rows(schema.passageSuggestions).push(suggestionRow({ draftId: 5n, chapter: 5, replacement }));
    const service = new PassageRewriteService({ getPostgresClient: () => tables.db } as never, {} as never, {} as never, {} as never, {} as never);
    return { tables, service };
  }

  it('should hold a rewrite that brings in a locked secret as a contradiction', async () => {
    const { tables, service } = lockedChapter(`They paid the ${TERM} at last.`);

    const { draft } = await service.apply(7n, 5, 50n, undefined);

    expect(draft.reviewStatus).toBe('contradiction');
    expect(tables.draft(5)?.['reviewStatus']).toBe('contradiction');
  });

  it('should leave a rewrite that gives nothing away for review as usual', async () => {
    const { tables, service } = lockedChapter(REWRITE);

    await service.apply(7n, 5, 50n, undefined);

    expect(tables.draft(5)?.['reviewStatus']).toBe('needs_review');
  });
});

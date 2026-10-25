import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { withTaskDataPolicy } from '../src/features/catalog/catalog-edits';
import {
  type DraftBase,
  type DraftEditPorts,
  featureNote,
  generatedNotesOf,
  isGeneratedNote,
  nextDraftNote,
  NOTE_MAX_LENGTH,
  runDraftEdit,
} from '../src/features/catalog/draft-edit';
import { type CatalogWriteOutcome } from '../src/lib/apis/catalog-outcome';
import { type SaveDraftBody, type SaveDraftResponse } from '../src/lib/apis/api-types.gen';
import { catalogFixture } from './catalog-fixture';

const restrictChat = (document: CatalogDocument) => withTaskDataPolicy(document, 'novel-forge.chat', 'in_cluster_only');

const conflict = (): ApiError => new ApiError(409, { type: 'CLIENT_ERROR', code: 'SYN_CATALOG_CONFLICT', message: 'The catalog changed concurrently' });

function savedOutcome(body: SaveDraftBody): CatalogWriteOutcome<SaveDraftResponse> {
  return {
    kind: 'done',
    value: {
      draft: { version: 0, state: 'DRAFT', createdAt: '2026-10-24T00:00:00.000Z', document: body.document, ...(body.note && { note: body.note }) },
      fingerprint: 'next',
      issues: [],
    },
  };
}

interface FakePorts extends DraftEditPorts {
  saved: SaveDraftBody[];
  loads: number;
}

function fakePorts(bases: DraftBase[], answers: ((body: SaveDraftBody) => CatalogWriteOutcome<SaveDraftResponse>)[] = []): FakePorts {
  const ports: FakePorts = {
    saved: [],
    loads: 0,
    loadBase: async () => {
      const base = bases[Math.min(ports.loads, bases.length - 1)];
      ports.loads += 1;
      if (!base) throw new ApiError(503, { type: 'SERVER_ERROR', code: 'UNAVAILABLE', message: 'Synapse is unavailable' });
      return base;
    },
    save: async body => {
      const answer = answers[ports.saved.length] ?? savedOutcome;
      ports.saved.push(body);
      return answer(body);
    },
  };
  return ports;
}

describe('runDraftEdit', () => {
  it('should save the edit on top of the draft, keeping its note and presenting its fingerprint', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc', note: 'Price review' }]);
    expect(await runDraftEdit(ports, restrictChat, 'Restrict chat')).toEqual({ kind: 'saved', issues: [] });
    expect(ports.saved[0]).toMatchObject({ note: 'Price review', expectedFingerprint: 'abc' });
  });

  it('should start a draft from the active document with the default note, pinned to that version', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: null, activeVersion: 7, note: ' ' }]);
    await runDraftEdit(ports, restrictChat, 'Restrict chat');
    expect(ports.saved[0]).toMatchObject({ note: 'Restrict chat', expectNoDraft: true, expectedActiveVersion: 7 });
  });

  it('should save nothing when the edit refuses, and tell that apart from an edit that changes nothing', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }]);
    expect(await runDraftEdit(ports, document => withTaskDataPolicy(document, 'app.missing', 'any'), 'n')).toEqual({
      kind: 'refused',
      reason: 'The draft has no feature "app.missing"',
    });
    expect(await runDraftEdit(ports, document => ({ ok: true, document: { ...document } }), 'n')).toEqual({ kind: 'unchanged' });
    expect(ports.saved).toHaveLength(0);
  });

  it('should re-apply the edit to the newer draft once after a conflict', async () => {
    const newer = { ...catalogFixture(), notes: 'saved meanwhile' };
    const ports = fakePorts(
      [
        { document: catalogFixture(), fingerprint: 'old' },
        { document: newer, fingerprint: 'new' },
      ],
      [
        () => {
          throw conflict();
        },
      ],
    );
    expect(await runDraftEdit(ports, restrictChat, 'n')).toEqual({ kind: 'saved', issues: [] });
    expect(ports.saved[1]).toMatchObject({ expectedFingerprint: 'new', document: { notes: 'saved meanwhile' } });
  });

  it('should pin the retried first draft to the version published meanwhile', async () => {
    const refuse = (): CatalogWriteOutcome<SaveDraftResponse> => {
      throw conflict();
    };
    const ports = fakePorts(
      [
        { document: catalogFixture(), fingerprint: null, activeVersion: 7 },
        { document: catalogFixture(), fingerprint: null, activeVersion: 8 },
      ],
      [refuse],
    );
    expect(await runDraftEdit(ports, restrictChat, 'n')).toEqual({ kind: 'saved', issues: [] });
    expect(ports.saved.map(body => body.expectedActiveVersion)).toEqual([7, 8]);
  });

  it('should give up after a second conflict', async () => {
    const refuse = (): CatalogWriteOutcome<SaveDraftResponse> => {
      throw conflict();
    };
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [refuse, refuse]);
    expect(await runDraftEdit(ports, restrictChat, 'n')).toEqual({ kind: 'conflict' });
    expect(ports.loads).toBe(2);
  });

  it('should report a refused document as invalid', async () => {
    const issues = [{ path: 'aliases.opus.model', code: 'unknown_model', message: 'Unknown model' }];
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [() => ({ kind: 'invalid', issues })]);
    expect(await runDraftEdit(ports, restrictChat, 'n')).toEqual({ kind: 'invalid', issues });
  });

  it('should report a failure to read or save the draft', async () => {
    expect(await runDraftEdit(fakePorts([]), restrictChat, 'n')).toEqual({ kind: 'failed', message: 'Synapse is unavailable' });
    const forbidden = (): CatalogWriteOutcome<SaveDraftResponse> => {
      throw new ApiError(403, { type: 'CLIENT_ERROR', code: 'FORBIDDEN', message: 'Your role cannot change budgets' });
    };
    expect(await runDraftEdit(fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [forbidden]), restrictChat, 'n')).toEqual({
      kind: 'failed',
      message: 'Your role cannot change budgets',
    });
  });
});

describe('nextDraftNote', () => {
  const known = generatedNotesOf(catalogFixture());
  const routing = 'Novel Forge · Chat: routing updated';
  const effort = 'Novel Forge · Chat: effort updated';

  it('should start a draft with the default note', () => {
    expect(nextDraftNote(undefined, routing, known)).toBe(routing);
    expect(nextDraftNote('  ', 'Provider Openrouter updated', known)).toBe('Provider Openrouter updated');
  });

  it('should add a new edit to a note the console wrote, once', () => {
    expect(nextDraftNote(routing, effort, known)).toBe(`${routing}; ${effort}`);
    expect(nextDraftNote(`${routing}; ${effort}`, routing, known)).toBe(`${routing}; ${effort}`);
  });

  it('should recognise the notes the provider, model and model name screens write about what the draft holds', () => {
    for (const note of ['Provider Openrouter updated', 'Model Opus 5.5 removed', 'Model Llama 3.1 updated', 'Model name Opus retargeted', 'Model name Sonnet now uses Llama 3.1'])
      expect(isGeneratedNote(note, known)).toBe(true);
    expect(nextDraftNote('Model name Sonnet now uses Llama 3.1', routing, known)).toBe(`Model name Sonnet now uses Llama 3.1; ${routing}`);
  });

  it('should keep a note a person wrote as written, even one shaped like a console note', () => {
    for (const note of [
      'Pricing updated',
      'Model pricing updated',
      'Provider costs removed',
      'Model name cleanup now uses ',
      'Q4 refresh: routing updated',
      'Novel Forge · Chat: pricing updated',
      'Price review; Model Opus 5.5 updated',
    ])
      expect(nextDraftNote(` ${note} `, effort, known)).toBe(note.trim());
  });

  it('should stop growing a note about something no longer in the draft', () => {
    expect(isGeneratedNote('Model GLM 5.2 removed', known)).toBe(false);
  });

  it('should match the note a feature section writes', () => {
    expect(featureNote({ app: 'novel-forge', name: 'chat' }, 'data policy')).toBe('Novel Forge · Chat: data policy updated');
    expect(isGeneratedNote(featureNote({ app: 'novel-forge', name: 'chat' }, 'data policy'), known)).toBe(true);
  });

  it('should stay within the note limit, and stop growing once cut', () => {
    const long = Array.from({ length: 40 }, () => 'Model Llama 3.1 updated').join('; ');
    const next = nextDraftNote(long, 'Provider Openrouter added', known);
    expect(next.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH);
    expect(next.endsWith('…')).toBe(true);
    expect(nextDraftNote(next, 'Model Opus 5.5 added', known)).toBe(next);
  });

  it('should save the grown note with the edit', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc', note: routing }]);
    await runDraftEdit(ports, restrictChat, 'Novel Forge · Chat: data policy updated');
    expect(ports.saved[0]?.note).toBe(`${routing}; Novel Forge · Chat: data policy updated`);
  });
});

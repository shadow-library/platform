import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { withAliasModel } from '../src/features/catalog/catalog-edits';
import { type DraftBase, type DraftEditPorts, runDraftEdit } from '../src/features/catalog/draft-edit';
import { type CatalogWriteOutcome } from '../src/lib/apis/catalog-outcome';
import { type SaveDraftBody, type SaveDraftResponse } from '../src/lib/apis/api-types.gen';
import { catalogFixture } from './catalog-fixture';

const retarget = (document: CatalogDocument) => withAliasModel(document, 'opus', 'sonnet-5.5');

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
    expect(await runDraftEdit(ports, retarget, 'Retarget Opus')).toEqual({ kind: 'saved', issues: [] });
    expect(ports.saved[0]).toMatchObject({ note: 'Price review', expectedFingerprint: 'abc' });
  });

  it('should start a draft from the active document with the default note, pinned to that version', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: null, activeVersion: 7, note: ' ' }]);
    await runDraftEdit(ports, retarget, 'Retarget Opus');
    expect(ports.saved[0]).toMatchObject({ note: 'Retarget Opus', expectNoDraft: true, expectedActiveVersion: 7 });
  });

  it('should save nothing when the edit refuses, and tell that apart from an edit that changes nothing', async () => {
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }]);
    expect(await runDraftEdit(ports, document => withAliasModel(document, 'gpt', 'x'), 'n')).toEqual({ kind: 'refused', reason: 'The draft has no model name "gpt"' });
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
    expect(await runDraftEdit(ports, retarget, 'n')).toEqual({ kind: 'saved', issues: [] });
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
    expect(await runDraftEdit(ports, retarget, 'n')).toEqual({ kind: 'saved', issues: [] });
    expect(ports.saved.map(body => body.expectedActiveVersion)).toEqual([7, 8]);
  });

  it('should give up after a second conflict', async () => {
    const refuse = (): CatalogWriteOutcome<SaveDraftResponse> => {
      throw conflict();
    };
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [refuse, refuse]);
    expect(await runDraftEdit(ports, retarget, 'n')).toEqual({ kind: 'conflict' });
    expect(ports.loads).toBe(2);
  });

  it('should report a refused document as invalid', async () => {
    const issues = [{ path: 'aliases.opus.model', code: 'unknown_model', message: 'Unknown model' }];
    const ports = fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [() => ({ kind: 'invalid', issues })]);
    expect(await runDraftEdit(ports, retarget, 'n')).toEqual({ kind: 'invalid', issues });
  });

  it('should report a failure to read or save the draft', async () => {
    expect(await runDraftEdit(fakePorts([]), retarget, 'n')).toEqual({ kind: 'failed', message: 'Synapse is unavailable' });
    const forbidden = (): CatalogWriteOutcome<SaveDraftResponse> => {
      throw new ApiError(403, { type: 'CLIENT_ERROR', code: 'FORBIDDEN', message: 'Your role cannot change budgets' });
    };
    expect(await runDraftEdit(fakePorts([{ document: catalogFixture(), fingerprint: 'abc' }], [forbidden]), retarget, 'n')).toEqual({
      kind: 'failed',
      message: 'Your role cannot change budgets',
    });
  });
});

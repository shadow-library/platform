import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import {
  type CatalogChangePorts,
  changeNote,
  type LiveCatalog,
  NOT_ALLOWED,
  NOTE_MAX_LENGTH,
  previewChange,
  runCatalogChange,
  truncateNote,
} from '../src/features/catalog/catalog-change';
import { type CatalogDocument } from '../src/features/catalog/catalog-document';
import { withTaskDataPolicy } from '../src/features/catalog/catalog-edits';
import { type ApplyChangeBody, type CatalogVersionSummaryResponse } from '../src/lib/apis/api-types.gen';
import { type CatalogWriteOutcome } from '../src/lib/apis/catalog-outcome';
import { catalogFixture } from './catalog-fixture';

type Answer = (body: ApplyChangeBody) => CatalogWriteOutcome<CatalogVersionSummaryResponse>;

const restrictChat = (document: CatalogDocument) => withTaskDataPolicy(document, 'novel-forge.chat', 'in_cluster_only');

const failure = (status: number, code: string, message: string): ApiError => new ApiError(status, { type: 'CLIENT_ERROR', code, message });

const published =
  (version: number): Answer =>
  () => ({ kind: 'done', value: { version, state: 'PUBLISHED', createdAt: '2026-10-25T00:00:00.000Z', createdByName: 'Ada' } });

const refuse =
  (error: ApiError): Answer =>
  () => {
    throw error;
  };

interface FakePorts extends CatalogChangePorts {
  sent: ApplyChangeBody[];
  loads: number;
}

function fakePorts(lives: LiveCatalog[], answers: Answer[] = []): FakePorts {
  const ports: FakePorts = {
    sent: [],
    loads: 0,
    loadLive: async () => {
      const live = lives[Math.min(ports.loads, lives.length - 1)];
      ports.loads += 1;
      if (!live) throw new ApiError(503, { type: 'SERVER_ERROR', code: 'UNAVAILABLE', message: 'Synapse is unavailable' });
      return live;
    },
    apply: async body => {
      const answer = answers[ports.sent.length] ?? published((body.expectedVersion ?? 0) + 1);
      ports.sent.push(body);
      return answer(body);
    },
  };
  return ports;
}

describe('previewChange', () => {
  it('should describe what the edit changes on the live version', () => {
    const preview = previewChange({ version: 4, document: catalogFixture() }, restrictChat);
    expect(preview.kind).toBe('ready');
    if (preview.kind === 'ready') expect(preview.changes.map(change => change.sentence)).toEqual([expect.stringContaining('data policy')]);
  });

  it('should describe everything as added when no version is live yet', () => {
    const preview = previewChange({ version: null, document: { tasks: {} } }, () => ({ ok: true, document: catalogFixture() }));
    expect(preview.kind === 'ready' && preview.changes.every(change => change.kind === 'added')).toBe(true);
  });

  it('should tell a refused edit apart from one that changes nothing', () => {
    expect(previewChange({ version: 4, document: catalogFixture() }, document => withTaskDataPolicy(document, 'app.missing', 'any'))).toEqual({
      kind: 'refused',
      reason: 'The catalog has no feature "app.missing"',
    });
    expect(previewChange({ version: 4, document: catalogFixture() }, document => ({ ok: true, document: { ...document } }))).toEqual({ kind: 'unchanged' });
  });
});

describe('runCatalogChange', () => {
  it('should apply the edit against the live version it was previewed on, with its note', async () => {
    const ports = fakePorts([]);
    const outcome = await runCatalogChange(ports, restrictChat, 'Novel Forge · Chat — data policy changed', { version: 4, document: catalogFixture() });
    expect(outcome).toEqual({ kind: 'applied', version: 5, previous: 4 });
    expect(ports.loads).toBe(0);
    expect(ports.sent[0]).toMatchObject({ expectedVersion: 4, note: 'Novel Forge · Chat — data policy changed' });
  });

  it('should expect no live version for the first catalog, and leave a blank note to the server', async () => {
    const ports = fakePorts([{ version: null, document: { tasks: {} } }]);
    expect(await runCatalogChange(ports, () => ({ ok: true, document: catalogFixture() }), '')).toEqual({ kind: 'applied', version: 1, previous: null });
    expect(ports.sent[0]?.expectedVersion).toBeNull();
    expect(ports.sent[0] && 'note' in ports.sent[0]).toBe(false);
  });

  it('should re-run the edit once on the version that went live meanwhile', async () => {
    const newer = { ...catalogFixture(), notes: 'changed meanwhile' };
    const ports = fakePorts([{ version: 5, document: newer }], [refuse(failure(409, 'SYN_CATALOG_CONFLICT', 'conflict'))]);
    expect(await runCatalogChange(ports, restrictChat, 'n', { version: 4, document: catalogFixture() })).toEqual({ kind: 'applied', version: 6, previous: 5 });
    expect(ports.sent[1]).toMatchObject({ expectedVersion: 5, document: { notes: 'changed meanwhile' } });
  });

  it('should give up after a second conflict', async () => {
    const conflict = refuse(failure(409, 'SYN_CATALOG_CONFLICT', 'conflict'));
    const ports = fakePorts([{ version: 4, document: catalogFixture() }], [conflict, conflict]);
    expect(await runCatalogChange(ports, restrictChat, 'n')).toEqual({ kind: 'conflict' });
    expect(ports.sent).toHaveLength(2);
  });

  it('should report the edit refusing on the newer version instead of overwriting it', async () => {
    const ports = fakePorts([{ version: 5, document: {} }], [refuse(failure(409, 'SYN_CATALOG_CONFLICT', 'conflict'))]);
    expect(await runCatalogChange(ports, restrictChat, 'n', { version: 4, document: catalogFixture() })).toEqual({
      kind: 'refused',
      reason: 'The catalog has no feature "novel-forge.chat"',
    });
  });

  it('should read the active version coming back as nothing to change', async () => {
    const ports = fakePorts([{ version: 4, document: catalogFixture() }], [published(4)]);
    expect(await runCatalogChange(ports, restrictChat, 'n')).toEqual({ kind: 'unchanged' });
  });

  it('should report a refused document as invalid', async () => {
    const issues = [{ path: 'aliases.opus.model', code: 'unknown_model', message: 'Unknown model' }];
    const ports = fakePorts([{ version: 4, document: catalogFixture() }], [() => ({ kind: 'invalid', issues })]);
    expect(await runCatalogChange(ports, restrictChat, 'n')).toEqual({ kind: 'invalid', issues });
  });

  it('should explain a missing section permission in plain words', async () => {
    const ports = fakePorts([{ version: 4, document: catalogFixture() }], [refuse(failure(403, 'IAM_002', 'Permission denied'))]);
    expect(await runCatalogChange(ports, restrictChat, 'n')).toEqual({ kind: 'refused', reason: NOT_ALLOWED });
  });

  it('should report a failure to read the live version or apply the change', async () => {
    expect(await runCatalogChange(fakePorts([]), restrictChat, 'n')).toEqual({ kind: 'failed', message: 'Synapse is unavailable' });
    const ports = fakePorts([{ version: 4, document: catalogFixture() }], [refuse(failure(500, 'S001', 'Something went wrong'))]);
    expect(await runCatalogChange(ports, restrictChat, 'n')).toEqual({ kind: 'failed', message: 'Something went wrong' });
  });

  it('should cut a long note to the server limit', async () => {
    const ports = fakePorts([{ version: 4, document: catalogFixture() }]);
    await runCatalogChange(ports, restrictChat, 'x'.repeat(600));
    expect(ports.sent[0]?.note?.length).toBe(NOTE_MAX_LENGTH);
  });
});

describe('changeNote', () => {
  const change = (sentence: string) => ({ sentence });

  it('should join the change sentences', () => {
    expect(changeNote([change('Provider OpenRouter — API key set to a stored key'), change('Model Opus — input price: $3 → $4')])).toBe(
      'Provider OpenRouter — API key set to a stored key; Model Opus — input price: $3 → $4',
    );
    expect(changeNote([])).toBe('');
  });

  it('should keep whole sentences and count the rest when they do not fit', () => {
    const note = changeNote(Array.from({ length: 30 }, (_, index) => change(`Model number ${index} — input price changed from one value to another`)));
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH);
    expect(note).toMatch(/; and \d+ more changes$/);
  });

  it('should cut a single sentence longer than the limit', () => {
    expect(changeNote([change('y'.repeat(700))])).toHaveLength(NOTE_MAX_LENGTH);
  });
});

describe('truncateNote', () => {
  it('should leave a note within the limit alone', () => {
    expect(truncateNote('Short note')).toBe('Short note');
  });

  it('should never split a character made of two code units', () => {
    const note = truncateNote(`${'a'.repeat(498)}😀😀`);
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH);
    expect(note.endsWith('…')).toBe(true);
    expect(note.includes('\uD83D…')).toBe(false);
  });
});

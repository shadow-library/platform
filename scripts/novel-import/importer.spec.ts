import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ForgeClient } from './forge-client.ts';
import { NovelImporter, STATE_FILE } from './importer.ts';
import { readManuscript } from './manuscript.ts';

interface FakeDraft {
  id: string;
  chapter: number;
  title: string | null;
  body: string;
  revision: number;
  saveSeq: number;
  status: string;
  reviewStatus: string;
}

const BASE_URL = 'https://forge.test';
const KEY = 'sl_bot_test_key_0001';

class FakeForge {
  readonly drafts = new Map<number, FakeDraft>();
  readonly calls: string[] = [];
  readonly projects: string[] = [];
  notes = '';
  cover: string | null = null;
  coverStatus = 204;
  rateLimitOnce = false;
  private nextId = 1;

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const route = url.pathname.replace('/api/v1/projects', '');
    this.calls.push(`${method} ${route}`);
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${KEY}`) return json(401, { code: 'IAM_001' });
    if (this.rateLimitOnce) {
      this.rateLimitOnce = false;
      return new Response('{"code":"S007"}', { status: 429, headers: { 'retry-after': '1' } });
    }
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    if (method === 'POST' && route === '') {
      this.projects.push(String(body['title']));
      return json(201, { id: '42', name: body['name'], title: body['title'] });
    }
    if (method === 'GET' && route === '/42') return json(200, { id: '42' });
    if (method === 'GET' && /^\/\d+$/.test(route)) return json(404, { code: 'PRJ_001' });
    if (method === 'PUT' && route === '/42/notes') {
      this.notes = String(body['notes']);
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && route === '/42/cover') {
      if (this.coverStatus !== 204) return json(this.coverStatus, { code: 'IAM_002' });
      this.cover = String(body['image']);
      return json(200, { id: '42' });
    }
    if (method === 'GET' && route === '/42/drafts/summary')
      return json(200, { items: [...this.drafts.values()].map(({ chapter, title, status, reviewStatus }) => ({ chapter, title, status, reviewStatus })) });

    const match = /^\/42\/drafts\/(\d+)(\/import|\/approve)?$/.exec(route);
    const chapter = Number(match?.[1]);
    const current = this.drafts.get(chapter);
    if (method === 'GET' && match && !match[2]) return current ? json(200, current) : json(404, { code: 'DRF_001' });
    if (method === 'POST' && match?.[2] === '/import') {
      const hasBase = body['baseDraftId'] !== undefined;
      if (!current) {
        if (hasBase) return json(404, { code: 'DRF_001' });
        if (chapter !== this.drafts.size + 1) return json(409, { code: 'DRF_010' });
        return json(200, this.save({ id: String(this.nextId++), chapter, title: null, body: '', revision: 0, saveSeq: 0, status: 'draft', reviewStatus: 'needs_review' }, body));
      }
      if (!hasBase) return json(409, { code: 'DRF_009' });
      if (body['baseDraftId'] !== current.id || body['baseRevision'] !== current.revision || body['baseSaveSeq'] !== current.saveSeq) return json(409, { code: 'DRF_013' });
      return json(200, this.save(current, body));
    }
    if (method === 'POST' && match?.[2] === '/approve' && current) {
      if (body['revision'] !== current.revision) return json(409, { code: 'DRF_013' });
      current.reviewStatus = 'approved';
      return json(200, current);
    }
    return json(404, { code: 'S003' });
  }) as typeof fetch;

  seed(chapter: number, body: string, extra: Partial<FakeDraft> = {}): FakeDraft {
    const draft = { id: String(this.nextId++), chapter, title: null, body, revision: 1, saveSeq: 1, status: 'draft', reviewStatus: 'needs_review', ...extra };
    this.drafts.set(chapter, draft);
    return draft;
  }

  private save(draft: FakeDraft, body: Record<string, unknown>): FakeDraft {
    const saved = {
      ...draft,
      title: typeof body['title'] === 'string' ? body['title'] : null,
      body: String(body['prose']),
      revision: draft.revision + 1,
      saveSeq: draft.saveSeq + 1,
      reviewStatus: 'needs_review',
    };
    this.drafts.set(draft.chapter, saved);
    return saved;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let dir: string;
let forge: FakeForge;

function writeFolder(chapters: Record<string, string>, novel?: object): void {
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  if (novel) fs.writeFileSync(path.join(dir, 'novel.json'), JSON.stringify(novel));
  for (const [file, text] of Object.entries(chapters)) fs.writeFileSync(path.join(dir, 'chapters', file), text);
}

function importer(options: ConstructorParameters<typeof NovelImporter>[1] = {}): NovelImporter {
  return new NovelImporter(new ForgeClient({ baseUrl: BASE_URL, botKey: KEY, fetchImpl: forge.fetch, sleep: async () => undefined }), options);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-import-'));
  forge = new FakeForge();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readManuscript', () => {
  it('should read chapters in number order, taking a leading heading as the title', () => {
    writeFolder(
      { '002-storm.md': 'The storm came.\r\n', '001-arrival.md': '# Arrival\n\nThe ferry docked at dawn.\n' },
      { title: 'Harbour Lights', notes: 'A quiet coastal story.' },
    );

    const manuscript = readManuscript(dir);

    expect(manuscript).toMatchObject({ title: 'Harbour Lights', name: 'Harbour Lights', notes: 'A quiet coastal story.' });
    expect(manuscript.chapters.map(({ number, title, prose }) => ({ number, title, prose }))).toEqual([
      { number: 1, title: 'Arrival', prose: 'The ferry docked at dawn.' },
      { number: 2, title: undefined, prose: 'The storm came.' },
    ]);
  });

  it('should refuse chapters with a gap, a repeat or no prose', () => {
    writeFolder({ '001-a.md': 'One.', '003-c.md': 'Three.' });
    expect(() => readManuscript(dir)).toThrow('expected 2');

    fs.rmSync(path.join(dir, 'chapters', '003-c.md'));
    writeFolder({ '002-b.md': '# Only a heading\n' });
    expect(() => readManuscript(dir)).toThrow('holds no prose');
  });

  it('should refuse a content mode Novel Forge does not have', () => {
    writeFolder({ '001-a.md': 'One.' }, { contentMode: 'spicy' });
    expect(() => readManuscript(dir)).toThrow('"contentMode" must be one of');
  });
});

describe('NovelImporter', () => {
  it('should create the project, record it beside the manuscript, store the notes and import every chapter in order', async () => {
    writeFolder({ '001-a.md': '# Arrival\nThe ferry docked.', '002-b.md': 'The storm came.' }, { title: 'Harbour Lights', notes: 'Coastal.' });

    const report = await importer().run(readManuscript(dir));

    expect(report).toMatchObject({ projectId: '42', projectCreated: true, cover: 'absent', chapters: { imported: [1, 2], conflict: [] } });
    expect(JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf-8'))).toEqual({ projects: { [BASE_URL]: { projectId: '42' } } });
    expect(forge.notes).toBe('Coastal.');
    expect(forge.drafts.get(1)).toMatchObject({ title: 'Arrival', body: 'The ferry docked.' });
  });

  it('should resume the recorded project and send only the chapters it is missing', async () => {
    writeFolder({ '001-a.md': 'One.', '002-b.md': 'Two.' });
    await importer().run(readManuscript(dir));
    writeFolder({ '003-c.md': 'Three.' });
    forge.calls.length = 0;

    const report = await importer().run(readManuscript(dir));

    expect(report).toMatchObject({ projectCreated: false, chapters: { imported: [3], unchanged: [1, 2] } });
    expect(forge.projects).toHaveLength(1);
    expect(forge.calls.filter(call => call.endsWith('/import'))).toEqual(['POST /42/drafts/3/import']);
  });

  it('should leave a chapter that differs in Novel Forge alone, and replace it against the draft it read only with overwrite', async () => {
    writeFolder({ '001-a.md': 'One.' });
    await importer().run(readManuscript(dir));
    writeFolder({ '001-a.md': 'One, rewritten.' });

    const kept = await importer().run(readManuscript(dir));
    expect(kept.chapters.conflict).toEqual([1]);
    expect(forge.drafts.get(1)?.body).toBe('One.');

    const replaced = await importer({ overwrite: true }).run(readManuscript(dir));
    expect(replaced.chapters.updated).toEqual([1]);
    expect(forge.drafts.get(1)).toMatchObject({ body: 'One, rewritten.', revision: 2 });
  });

  it('should fill a chapter opened in Novel Forge but left empty, and never replace a finalized one', async () => {
    fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify({ projects: { [BASE_URL]: { projectId: '42' } } }));
    forge.seed(1, 'Final words.', { status: 'final' });
    forge.seed(2, '');
    writeFolder({ '001-a.md': 'Different words.', '002-b.md': 'Two.' });

    const report = await importer({ overwrite: true }).run(readManuscript(dir));

    expect(report.chapters).toMatchObject({ conflict: [1], imported: [2] });
    expect(forge.drafts.get(1)?.body).toBe('Final words.');
    expect(forge.drafts.get(2)?.body).toBe('Two.');
  });

  it('should approve what it imported and what was already there, once', async () => {
    writeFolder({ '001-a.md': 'One.' });
    await importer().run(readManuscript(dir));
    writeFolder({ '002-b.md': 'Two.' });

    const first = await importer({ approve: true }).run(readManuscript(dir));
    const second = await importer({ approve: true }).run(readManuscript(dir));

    expect(first.approved).toEqual([1, 2]);
    expect(second.approved).toEqual([]);
  });

  it('should upload the cover once, and carry on with a warning when the bot may not set covers', async () => {
    writeFolder({ '001-a.md': 'One.' });
    fs.writeFileSync(path.join(dir, 'cover.png'), new Uint8Array([137, 80, 78, 71]));

    expect((await importer().run(readManuscript(dir))).cover).toBe('uploaded');
    expect((await importer().run(readManuscript(dir))).cover).toBe('unchanged');

    fs.writeFileSync(path.join(dir, 'cover.png'), new Uint8Array([137, 80, 78, 71, 1]));
    forge.coverStatus = 403;
    const refused = await importer().run(readManuscript(dir));
    expect(refused.cover).toBe('refused');
    expect(refused.warnings[0]).toContain('NovelForgeIllustrator');
  });

  it('should wait out a rate limit and refuse a recorded project the bot can no longer see', async () => {
    writeFolder({ '001-a.md': 'One.' });
    forge.rateLimitOnce = true;
    expect((await importer().run(readManuscript(dir))).chapters.imported).toEqual([1]);

    fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify({ projects: { [BASE_URL]: { projectId: '7' } } }));
    await expect(importer().run(readManuscript(dir))).rejects.toThrow('remove its entry');
  });
});

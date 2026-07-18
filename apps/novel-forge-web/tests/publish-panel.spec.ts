/**
 * Publish panel (PB4) — UI coverage against a mocked backend.
 *
 * Fully self-hosting: the suite starts an in-process mock of novel-forge-server's session +
 * publishing surface and its own prebuilt app server, both on high ports (app :3010, mock API
 * :8099) so it never collides with a live dev stack on :3000/:8080. Run it alone with:
 *
 *   PW_NO_WEBSERVER=1 bunx playwright test tests/publish-panel.spec.ts
 *
 * Needs `dist/` (bun run build); the default webServer command and CI both build before tests run.
 */
/// <reference types="node" /> — tsconfig pins types to vite/client; node builtins need @types/node here.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

// ─── Ports & processes ──────────────────────────────────────────────────────────

const MOCK_PORT = 8099;
const APP_PORT = 3010;
const HEALTH_PORT = 3013;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ─── Mock backend state ─────────────────────────────────────────────────────────

interface MockPublication {
  id: string;
  novelSlug: string;
  title: string;
  blurb?: string | null;
  coverPath?: string | null;
  genres?: string[] | null;
  status: 'live' | 'retired';
  revision: number;
  updatedAt: string;
}

interface MockChapterRow {
  id: string;
  chapter: number;
  publishedOrdinal: number;
  title: string;
  authorNote?: string | null;
  contentHash: string;
  revision: number;
  status: 'scheduled' | 'published' | 'failed' | 'unpublished';
  scheduledAt?: string | null;
  publishedAt?: string | null;
  error?: string | null;
  updatedAt: string;
}

const NOW = new Date().toISOString();
const PROJECT = {
  id: '1',
  name: 'Hollow Saga',
  kind: 'new_novel',
  title: 'The Hollow Saga',
  coverImagePath: null,
  contentMode: 'standard',
  scrapeComplete: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const DRAFTS = [
  { chapter: 1, title: 'The Hollow Crown', reviewStatus: 'approved' },
  { chapter: 2, title: 'Ash and Salt', reviewStatus: 'final' },
  { chapter: 3, title: 'The Long Night', reviewStatus: 'needs_review' },
].map((draft, i) => ({
  id: String(i + 1),
  projectId: '1',
  chapter: draft.chapter,
  title: draft.title,
  status: 'final',
  revision: 1,
  reviewStatus: draft.reviewStatus,
  generator: 'ai',
  createdAt: NOW,
  updatedAt: NOW,
}));

const state = {
  publication: null as MockPublication | null,
  chapters: new Map<number, MockChapterRow>(),
  nextOrdinal: 1,
};

function chapterRow(chapter: number, patch: Partial<MockChapterRow>): MockChapterRow {
  const existing = state.chapters.get(chapter);
  const draft = DRAFTS.find(d => d.chapter === chapter);
  return {
    id: String(chapter),
    chapter,
    publishedOrdinal: existing?.publishedOrdinal ?? state.nextOrdinal++,
    title: draft?.title ?? `Chapter ${chapter}`,
    contentHash: `hash-${chapter}-${(existing?.revision ?? 0) + 1}`,
    revision: (existing?.revision ?? 0) + 1,
    status: 'published',
    scheduledAt: null,
    publishedAt: null,
    error: null,
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

// ─── Mock backend HTTP surface ──────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function handleMockRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/api/auth/session') return json(res, 200, { userId: 'user-1', email: 'author@example.com', name: 'Test Author' });
  if (method === 'GET' && path === '/api/v1/projects') return json(res, 200, { total: 1, limit: 50, offset: 0, items: [PROJECT] });
  if (method === 'GET' && path === '/api/v1/projects/1') return json(res, 200, PROJECT);
  if (method === 'GET' && path === '/api/v1/projects/1/status')
    return json(res, 200, { kind: 'new_novel', chaptersTotal: 3, draftsTotal: 3, draftsFinal: 2, planApproved: true, volumesTotal: 1 });
  if (method === 'GET' && path === '/api/v1/projects/1/review-queue') return json(res, 200, { drafts: [] });
  if (method === 'GET' && path === '/api/v1/projects/1/proposals') return json(res, 200, { total: 0, limit: 50, offset: 0, items: [] });
  if (method === 'GET' && path === '/api/v1/projects/1/jobs') return json(res, 200, { items: [] });
  if (method === 'GET' && path === '/api/v1/projects/1/drafts') return json(res, 200, { items: DRAFTS });

  if (method === 'GET' && path === '/api/v1/projects/1/publications') {
    const chapters = [...state.chapters.values()].sort((a, b) => a.publishedOrdinal - b.publishedOrdinal);
    return json(res, 200, state.publication ? { publication: state.publication, chapters } : { chapters });
  }

  if (method === 'POST' && path === '/api/v1/projects/1/publish') {
    const body = await readBody(req);
    const previous = state.publication;
    state.publication = {
      id: '10',
      novelSlug: previous?.novelSlug ?? (typeof body.novelSlug === 'string' && body.novelSlug ? body.novelSlug : 'the-hollow-saga'),
      title: typeof body.title === 'string' && body.title ? body.title : (previous?.title ?? 'Untitled'),
      blurb: (body.blurb as string | null | undefined) ?? null,
      coverPath: (body.coverPath as string | null | undefined) ?? null,
      genres: (body.genres as string[] | undefined) ?? null,
      status: body.status === 'retired' ? 'retired' : 'live',
      revision: (previous?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    return json(res, 200, state.publication);
  }

  const chapterMatch = path.match(/^\/api\/v1\/projects\/1\/chapters\/(\d+)\/publish$/);
  if (chapterMatch) {
    const chapter = Number(chapterMatch[1]);
    if (method === 'POST') {
      const draft = DRAFTS.find(d => d.chapter === chapter);
      const approved = draft && (draft.reviewStatus === 'approved' || draft.reviewStatus === 'final');
      if (!approved) return json(res, 400, { code: 'PUB_002', type: 'CLIENT_ERROR', message: `Chapter ${chapter} is not finalized or approved — nothing unreviewed ships` });
      const body = await readBody(req);
      const scheduledAt = typeof body.scheduledAt === 'string' ? body.scheduledAt : undefined;
      const future = scheduledAt !== undefined && new Date(scheduledAt).getTime() > Date.now();
      const row = future ? chapterRow(chapter, { status: 'scheduled', scheduledAt }) : chapterRow(chapter, { status: 'published', publishedAt: new Date().toISOString() });
      state.chapters.set(chapter, row);
      return json(res, 202, row);
    }
    if (method === 'DELETE') {
      const existing = state.chapters.get(chapter);
      if (!existing) return json(res, 404, { code: 'PUB_001', type: 'NOT_FOUND', message: 'Publication not found' });
      const row = chapterRow(chapter, { status: 'unpublished', revision: existing.revision });
      state.chapters.set(chapter, row);
      return json(res, 202, row);
    }
  }

  if (method === 'POST' && path === '/api/v1/projects/1/publications/reconcile')
    return json(res, 200, { novel: 'applied', pushed: [1], deleted: [], skipped: [2], failed: [{ ordinal: 3, error: 'reader answered 503' }], unknownOrdinals: [9] });

  return json(res, 404, { code: 'NOT_FOUND', type: 'CLIENT_ERROR', message: `No mock for ${method} ${path}` });
}

// ─── Suite ──────────────────────────────────────────────────────────────────────

let mockServer: Server;
let appProcess: ChildProcess | undefined;

test.use({ baseURL: APP_URL });

test.describe('Publish panel', () => {
  // One mock + one app server for the whole file; the tests build on each other's ledger state.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const entry = `${ROOT}dist/server/server.js`;
    if (!existsSync(entry)) throw new Error(`Missing ${entry} — run \`bun run build\` before this suite.`);

    mockServer = createServer((req, res) => {
      handleMockRequest(req, res).catch(() => json(res, 500, { code: 'MOCK_ERROR', type: 'SERVER_ERROR', message: 'mock handler crashed' }));
    });
    await new Promise<void>(resolve => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve));

    appProcess = spawn('bun', ['run', 'start'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(APP_PORT), HEALTH_PORT: String(HEALTH_PORT), API_ORIGIN: `http://127.0.0.1:${MOCK_PORT}` },
      stdio: 'ignore',
    });

    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const res = await fetch(`${APP_URL}/login`);
        if (res.status < 500) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) throw new Error('App server did not become ready on :3010');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  test.afterAll(async () => {
    appProcess?.kill('SIGTERM');
    await new Promise<void>(resolve => mockServer.close(() => resolve()));
  });

  test('should render the metadata editor and one row per chapter', async ({ page }) => {
    await page.goto('/novels/1/publish');
    await expect(page.getByRole('heading', { level: 1, name: 'Publish' })).toBeVisible();

    // Never published: the slug is still editable and every chapter is unreleased.
    await expect(page.getByRole('textbox', { name: 'Slug' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Publish novel' })).toBeVisible();
    for (const chapter of [1, 2, 3]) await expect(page.locator(`[data-chapter="${chapter}"]`)).toContainText('not published');
    await expect(page.locator('[data-chapter="3"]')).toContainText('needs review');

    // No publication yet — reconcile has nothing to diff against.
    await expect(page.getByRole('button', { name: 'Reconcile reader' })).toBeDisabled();
  });

  test('should publish the novel and lock the slug afterwards', async ({ page }) => {
    await page.goto('/novels/1/publish');
    await page.getByRole('textbox', { name: 'Slug' }).fill('the-hollow-saga');
    await page.getByRole('textbox', { name: 'Blurb' }).fill('A crown, a curse, and a cartographer.');
    await page.getByRole('textbox', { name: 'Genres' }).fill('fantasy, adventure');
    await page.getByRole('button', { name: 'Publish novel' }).click();

    // The listing is live: status chip + save mode, and the slug becomes immutable.
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Slug' })).toBeDisabled();
    await expect(page.locator('.nf-chip', { hasText: 'live' })).toBeVisible();
  });

  test('should publish an approved chapter and flip its row to published', async ({ page }) => {
    await page.goto('/novels/1/publish');
    const row = page.locator('[data-chapter="1"]');
    await row.getByRole('button', { name: 'Publish now' }).click();

    await expect(row.locator('.nf-chip', { hasText: 'published' })).toBeVisible();
    // The reader-ordinal cell shows the assigned ordinal instead of the '—' placeholder.
    await expect(row).not.toContainText('—');
    await expect(row.getByRole('button', { name: 'Republish' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  });

  test('should surface the PUB_002 gate message inline for an unapproved chapter', async ({ page }) => {
    await page.goto('/novels/1/publish');
    await page.locator('[data-chapter="3"]').getByRole('button', { name: 'Publish now' }).click();

    await expect(page.getByText('Chapter 3 is not finalized or approved — nothing unreviewed ships')).toBeVisible();
    // The gate failure never creates a ledger row.
    await expect(page.locator('[data-chapter="3"]')).toContainText('not published');
  });

  test('should schedule a chapter for a future time', async ({ page }) => {
    await page.goto('/novels/1/publish');
    const row = page.locator('[data-chapter="2"]');
    await row.getByRole('button', { name: 'Schedule…' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Schedule chapter 2');
    await dialog.locator('input[type="datetime-local"]').fill('2030-01-01T10:30');
    await dialog.getByRole('button', { name: 'Schedule' }).click();

    await expect(row.locator('.nf-chip', { hasText: 'scheduled' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Publish now' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  });

  test('should unpublish a published chapter and offer republish', async ({ page }) => {
    await page.goto('/novels/1/publish');
    const row = page.locator('[data-chapter="1"]');
    await row.getByRole('button', { name: 'Unpublish' }).click();

    await expect(row.locator('.nf-chip', { hasText: 'unpublished' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Republish' })).toBeVisible();
  });

  test('should show the push error on a failed row', async ({ page }) => {
    // Failure is the executor's outcome, not a UI action — seed the ledger directly.
    state.chapters.set(2, chapterRow(2, { status: 'failed', error: 'reader service unreachable', revision: state.chapters.get(2)?.revision ?? 1 }));
    await page.goto('/novels/1/publish');

    const row = page.locator('[data-chapter="2"]');
    const chip = row.locator('.nf-chip', { hasText: 'failed' });
    await expect(chip).toBeVisible();
    await chip.hover();
    await expect(page.getByText('reader service unreachable')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('should run reconcile and show the result summary', async ({ page }) => {
    await page.goto('/novels/1/publish');
    await page.getByRole('button', { name: 'Reconcile reader' }).click();

    await expect(page.getByText('Reconcile result')).toBeVisible();
    await expect(page.getByText('1 pushed')).toBeVisible();
    await expect(page.getByText('1 in sync')).toBeVisible();
    await expect(page.getByText('1 failed')).toBeVisible();
    await expect(page.getByText('Reader chapter 3 — reader answered 503')).toBeVisible();
    await expect(page.getByText('ordinals the ledger cannot account for: 9')).toBeVisible();
  });
});

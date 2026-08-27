/**
 * Importing npm packages
 */
import { type APIRequestContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl } from '../../lib';
import { createProject, deleteProjectQuietly, HAIKU_MODEL, jsonOrUndefined, uniqueSuffix } from './forge-helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Ownership is enforced by `ProjectOwnershipGuard`, which answers another user's project with 404 PRJ_001 — a
 * deliberate BOLA defence that never leaks existence via 403. These tests assert the *code*, not just the
 * status, so a future accidental 403 would fail here. The Unrestricted block records the real server behaviour:
 * `resolveModel` coerces disallowed overrides on Unrestricted projects (model-router.service.ts) and the PATCH itself does not
 * validate the override against contentMode — so AI_003, though defined, is never thrown (see the fixme).
 */

test.describe('novel-forge ownership security', () => {
  let victimCtx: APIRequestContext;
  let attackerCtx: APIRequestContext;
  let victimProjectId: string;

  test.beforeAll(async () => {
    victimCtx = await apiContext('novelForge', 'user1');
    attackerCtx = await apiContext('novelForge', 'user2');
    const { id } = await createProject(victimCtx, { name: `e2e-forge-sec-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard', title: 'Victim Novel' });
    victimProjectId = id;
    expect(victimProjectId, 'victim project must be created for the security spec').toMatch(/^[0-9]+$/);
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(victimCtx, victimProjectId);
    await victimCtx.dispose();
    await attackerCtx.dispose();
  });

  test('should answer another user GET with 404 PRJ_001, never 403', async () => {
    const response = await attackerCtx.get(`/api/v1/projects/${victimProjectId}`);
    expect(response.status()).toBe(404);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('PRJ_001');
  });

  test('should answer another user PATCH with 404 PRJ_001', async () => {
    const response = await mutate(attackerCtx, 'patch', `/api/v1/projects/${victimProjectId}`, { data: { title: 'hijacked' } });
    expect(response.status()).toBe(404);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('PRJ_001');
  });

  test('should answer another user DELETE with 404 PRJ_001', async () => {
    const response = await mutate(attackerCtx, 'delete', `/api/v1/projects/${victimProjectId}`);
    expect(response.status()).toBe(404);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('PRJ_001');
  });

  test('should reject an unauthenticated project list with 401', async () => {
    const anon = await apiContext('novelForge');
    try {
      const response = await anon.get('/api/v1/projects');
      expect(response.status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  });

  test('should send a guest visiting a workspace overview to a login surface', async ({ browser }) => {
    const base = requireProductUrl('novelForge');
    // A brand-new context carries no session — the workspace route's guard must redirect before any ownership
    // check runs, so a real (even nonexistent-to-the-guest) project id is a fine target.
    const guest = await browser.newContext();
    try {
      const page = await guest.newPage();
      await page.goto(`${base}/novels/${victimProjectId}/overview`);
      await expect(page).toHaveURL(/\/login/i, { timeout: 20_000 });
    } finally {
      await guest.close();
    }
  });
});

test.describe('novel-forge unrestricted enforcement', () => {
  let ctx: APIRequestContext;
  let projectId: string;

  test.beforeAll(async () => {
    ctx = await apiContext('novelForge', 'user1');
    const { id } = await createProject(ctx, { name: `e2e-forge-unrestricted-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'unrestricted' });
    projectId = id;
  });

  test.afterAll(async () => {
    await deleteProjectQuietly(ctx, projectId);
    await ctx.dispose();
  });

  test('should accept (but not honour) an anthropic override on an Unrestricted project', async () => {
    // The PATCH is NOT the enforcement point: the server stores whatever override is sent. Enforcement is at
    // resolve time, where Unrestricted coerces disallowed models to the group default. So the
    // contract here is: 200, and the override round-trips in config.models — inert, not rejected.
    const patch = await mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { config: { models: { generation: HAIKU_MODEL } } } });
    expect(patch.status(), await patch.text()).toBe(200);

    const fetched = await ctx.get(`/api/v1/projects/${projectId}`);
    const body = (await fetched.json()) as { contentMode: string; config?: { models?: Record<string, { provider: string }> } };
    expect(body.contentMode).toBe('unrestricted');
    expect(body.config?.models?.generation?.provider).toBe('anthropic');
  });

  // AI_003 is defined but thrown nowhere — Unrestricted silently coerces at resolve time. Recorded, not "fixed".
  test.fixme('should reject an anthropic AI dispatch on an Unrestricted project with AI_003', async () => {
    const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, { data: { overview: 'An Unrestricted project that should refuse anthropic.' } });
    expect(response.status()).toBe(400);
    expect((await jsonOrUndefined<{ code: string }>(response))?.code).toBe('AI_003');
  });
});

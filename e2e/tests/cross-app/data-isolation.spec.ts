/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, readSeedManifest, requireProductUrl } from '../../lib';
import { scopedMutate } from './helpers';

/**
 * Defining types
 */

interface ProjectSummary {
  readonly id: string;
  readonly name: string;
}

/**
 * Declaring the constants
 *
 * Cross-user data isolation: one authenticated user must never see another's private state on any product. The
 * seed gives user1 a RESTRICTED novel accessible only through a per-user grant; user2 has no grant for it. The
 * Web Novel checks are anchored on that RESTRICTED novel rather than the PUBLIC one, because a PUBLIC novel is
 * legitimately readable (and trackable) by *anyone* — user2 reading it is not a leak. The RESTRICTED novel is the
 * genuinely private, grant-gated resource: user1 can reach it, user2 must not, anywhere. The Novel Forge check
 * covers its owner-scoped project list — each user creates a throwaway project and must see only their own.
 */
const FORGE_LIST_PATH = '/api/v1/projects';

test.describe('cross-user data isolation', () => {
  const { webNovel } = readSeedManifest();

  test("should keep user1's granted RESTRICTED novel out of user2's reader endpoints", async () => {
    // user2 has no grant, so the restricted novel must never surface in either of user2's per-user reader lists,
    // regardless of what user2 has legitimately read on public novels.
    const ctx = await apiContext('webNovel', 'user2');

    const progress = await ctx.get('/api/me/progress');
    expect(progress.status()).toBe(200);
    const progressItems = ((await progress.json()) as { items: { slug?: string; novelSlug?: string }[] }).items;
    expect(
      progressItems.map(i => i.slug ?? i.novelSlug),
      "user1's RESTRICTED novel must not appear in user2's progress",
    ).not.toContain(webNovel.restrictedSlug);

    const library = await ctx.get('/api/library');
    expect(library.status()).toBe(200);
    const libraryItems = ((await library.json()) as { items: { slug?: string; novelSlug?: string }[] }).items;
    expect(
      libraryItems.map(i => i.slug ?? i.novelSlug),
      "user1's RESTRICTED novel must not appear in user2's library",
    ).not.toContain(webNovel.restrictedSlug);
  });

  test('should let the granted user read the RESTRICTED novel while hiding it byte-identically from a non-granted user', async () => {
    // The sharp edge of isolation: the exact same request is a 200 for the grant-holder and an indistinguishable
    // 404 (WBN_001, the same code an unknown slug returns — no existence probe) for everyone else.
    const asUser1 = await apiContext('webNovel', 'user1');
    const granted = await asUser1.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(granted.status(), 'user1 holds the grant and must be able to read the restricted novel').toBe(200);

    const asUser2 = await apiContext('webNovel', 'user2');
    const denied = await asUser2.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(denied.status(), 'user2 has no grant and must not be able to read the restricted novel').toBe(404);
    expect(((await denied.json()) as { code?: string }).code, 'the denial must be indistinguishable from a missing novel').toBe('WBN_001');
  });

  test('should scope Novel Forge project lists strictly to their owner', async () => {
    test.setTimeout(60_000);
    const forgeUrl = requireProductUrl('novelForge');
    const user1 = await apiContext('novelForge', 'user1');
    const user2 = await apiContext('novelForge', 'user2');
    const created: { ctx: typeof user1; id: string }[] = [];

    try {
      // Each user creates a distinctly-named throwaway project.
      const stamp = Date.now();
      const name1 = `e2e-isolation-u1-${stamp}`;
      const name2 = `e2e-isolation-u2-${stamp}`;
      const make = async (ctx: typeof user1, name: string): Promise<string> => {
        const response = await scopedMutate(ctx, forgeUrl, 'post', FORGE_LIST_PATH, { data: { name, kind: 'new_novel' } });
        expect(response.status(), `creating ${name}`).toBe(201);
        const id = ((await response.json()) as ProjectSummary).id;
        created.push({ ctx, id });
        return id;
      };
      const id1 = await make(user1, name1);
      const id2 = await make(user2, name2);

      // Each list contains the owner's project and never the other's.
      const listNames = async (ctx: typeof user1): Promise<{ ids: string[]; names: string[] }> => {
        const response = await ctx.get(FORGE_LIST_PATH);
        expect(response.status()).toBe(200);
        const parsed = (await response.json()) as ProjectSummary[] | { items: ProjectSummary[] };
        const items = Array.isArray(parsed) ? parsed : parsed.items;
        return { ids: items.map(p => p.id), names: items.map(p => p.name) };
      };
      const u1List = await listNames(user1);
      const u2List = await listNames(user2);

      expect(u1List.ids, 'user1 must see their own project').toContain(id1);
      expect(u1List.ids, "user1 must NOT see user2's project").not.toContain(id2);
      expect(u2List.ids, 'user2 must see their own project').toContain(id2);
      expect(u2List.ids, "user2 must NOT see user1's project").not.toContain(id1);
      expect(u2List.names, "user1's project name must not leak into user2's list").not.toContain(name1);
    } finally {
      // Clean up both throwaway projects regardless of assertion outcome.
      for (const { ctx, id } of created) await scopedMutate(ctx, forgeUrl, 'delete', `${FORGE_LIST_PATH}/${id}`);
      await user1.dispose();
      await user2.dispose();
    }
  });
});

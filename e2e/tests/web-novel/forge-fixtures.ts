/**
 * Importing npm packages
 */
import { type APIRequestContext, test as base } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, clearIpState, freshClientIp, runAll } from '../../lib';
import { expectImportLanded, startFinalImport } from '../novel-forge/forge-bundles';
import { createForgeProject, type ForgePublication, type ForgeSession, openCuratorSession, removeForgePublication } from './forge-publication';
import { deleteNovels, uniqueNovelSlug } from './helpers';

/**
 * Defining types
 */

export interface ForgeProjectOptions {
  /** Lands the three finalized chapters of `FINAL_BUNDLE` through a novel import, so chapters can be published without a model. */
  chapters?: boolean;
  /** The author's forge context; user1's when omitted. */
  ctx?: APIRequestContext;
}

export interface ForgeLane {
  /** A fresh, unpublished project and the slug reserved for it; removed with everything the reader holds for it after the test. */
  project(label: string, options?: ForgeProjectOptions): Promise<ForgePublication>;
  /** The bootstrap admin's forge context, which carries `novel-forge:curate`. */
  curator(): Promise<APIRequestContext>;
  /** A further slug a test publishes under, so its reader rows and audit trail are removed too. */
  slug(label: string): string;
  readonly guest: APIRequestContext;
}

/**
 * Declaring the constants
 *
 * Web-novel's `/internal/novels/*` ingest is reached the one legitimate way: an author's novel-forge project, whose converge makes the
 * real in-cluster call. Each test gets its own projects and slugs; teardown settles any push still running, deletes the projects, and
 * removes every reader row and audit row under any slug the test used, even when setup failed half way.
 */

export const test = base.extend<{ forge: ForgeLane }>({
  // Playwright reads fixture dependencies from the destructuring pattern, so a dependency-free fixture must still declare one.
  // eslint-disable-next-line no-empty-pattern
  forge: async ({}, use) => {
    const author = await apiContext('novelForge', 'user1');
    const guest = await apiContext('webNovel');
    const projects: ForgePublication[] = [];
    const slugs: string[] = [];
    let clientIp: string | undefined;
    let curator: ForgeSession | undefined;

    const slug = (label: string): string => {
      const reserved = uniqueNovelSlug(label);
      slugs.push(reserved);
      return reserved;
    };

    try {
      await use({
        guest,
        slug,
        project: async (label, options = {}) => {
          const ctx = options.ctx ?? author;
          const reserved = slug(label);
          if (!options.chapters) {
            const publication = { ctx, projectId: await createForgeProject(ctx, reserved), slug: reserved };
            projects.push(publication);
            return publication;
          }
          const { projectId, jobId } = await startFinalImport(ctx, `E2E ${reserved}`);
          const publication = { ctx, projectId, slug: reserved };
          projects.push(publication);
          await expectImportLanded(jobId);
          return publication;
        },
        curator: async () => {
          clientIp ??= await freshClientIp();
          curator ??= await openCuratorSession(clientIp);
          return curator.ctx;
        },
      });
    } finally {
      const session = curator;
      const ip = clientIp;
      await runAll([
        ...projects.map(project => () => removeForgePublication(project.ctx, project.projectId, project.slug)),
        () => deleteNovels(slugs),
        ...(session ? [() => session.close()] : []),
        ...(ip ? [() => clearIpState(ip)] : []),
        () => author.dispose(),
        () => guest.dispose(),
      ]);
    }
  },
});

export { expect } from '@playwright/test';

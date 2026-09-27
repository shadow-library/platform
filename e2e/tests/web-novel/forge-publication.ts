/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb, pollUntil, runAll, webNovelDb } from '../../lib';
import { createProject } from '../novel-forge/forge-helpers';
import { deleteNovels, type NovelVisibility } from './helpers';

/**
 * Defining types
 */

export interface ForgePublication {
  /** The author's novel-forge context; every access change goes through its public API. */
  readonly ctx: APIRequestContext;
  readonly projectId: string;
  readonly slug: string;
}

export interface ForgeAccessGrant {
  readonly email: string;
  readonly subjectId?: string | null;
  readonly state: 'resolved' | 'pending';
}

export interface ForgeAccess {
  readonly visibility: NovelVisibility;
  readonly accessRevision: number;
  readonly grants: ForgeAccessGrant[];
}

export interface PublishJob {
  readonly status: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
  readonly lastError: string | null;
}

/**
 * Declaring the constants
 *
 * Novel-forge is the only caller web-novel admits to `/internal/novels/*`, and only from inside its pod, so these drive the reader's
 * access surface the one legitimate way: the author's own forge API, whose auto-push converge makes the real in-cluster call.
 */

export const FORGE_CLIENT_ID = 'novel-forge';

const PUBLISH_SETTLE_TIMEOUT_MS = 60_000;

export class ForgePublicationError extends Error {
  override readonly name = 'ForgePublicationError';
}

function isActive(job: PublishJob | undefined): boolean {
  return job?.status === 'pending' || job?.status === 'in_progress';
}

async function expectStatus(response: APIResponse, status: number, action: string): Promise<void> {
  if (response.status() !== status) throw new ForgePublicationError(`${action} answered ${response.status()}: ${await response.text()}`);
}

/**
 * Waits for the project's one `publish` job to leave pending/in-progress. A forge mutation made while that job is active dedups onto it
 * and can miss the pass that job already started, so every access change settles the push it caused before anything else happens.
 */
export async function settlePublishJob(projectId: string): Promise<PublishJob | undefined> {
  const job = await pollUntil(
    async () => (await novelForgeDb()<PublishJob[]>`SELECT status, last_error AS "lastError" FROM jobs WHERE project_id = ${projectId} AND kind = 'publish'`)[0],
    current => !isActive(current),
    { timeoutMs: PUBLISH_SETTLE_TIMEOUT_MS, intervalMs: 250 },
  );
  if (isActive(job)) throw new ForgePublicationError(`publish job for project ${projectId} still ${job?.status} after ${PUBLISH_SETTLE_TIMEOUT_MS}ms`);
  return job;
}

export async function createForgeProject(ctx: APIRequestContext, slug: string): Promise<string> {
  const { id, response } = await createProject(ctx, { name: slug, kind: 'new_novel', contentMode: 'standard' });
  await expectStatus(response, 201, 'project create');
  return id;
}

/** Publishes the project's metadata under `slug` and waits until the reader serves it. */
export async function publishForgeNovel(ctx: APIRequestContext, projectId: string, slug: string): Promise<void> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/publish`, { data: { novelSlug: slug, title: `E2E ${slug}` } });
  await expectStatus(response, 200, 'novel publish');
  const job = await settlePublishJob(projectId);
  if (job?.status !== 'done') throw new ForgePublicationError(`the first publish of ${slug} did not converge: ${job?.status} ${job?.lastError ?? ''}`);
}

/** Replaces the publication's share list as the author's access panel does, without waiting on the push it enqueues. */
export async function putForgeAccess(publication: ForgePublication, visibility: NovelVisibility, emails: string[]): Promise<ForgeAccess> {
  const response = await mutate(publication.ctx, 'put', `/api/v1/projects/${publication.projectId}/publications/access`, {
    data: { visibility, grants: emails.map(email => ({ email })) },
  });
  await expectStatus(response, 200, 'access update');
  return (await response.json()) as ForgeAccess;
}

/** {@link putForgeAccess}, then settles the push it enqueued and requires it to end `expected`. */
export async function setForgeAccess(publication: ForgePublication, visibility: NovelVisibility, emails: string[], expected: 'done' | 'failed' = 'done'): Promise<ForgeAccess> {
  const access = await putForgeAccess(publication, visibility, emails);
  const job = await settlePublishJob(publication.projectId);
  if (job?.status !== expected) throw new ForgePublicationError(`the access push for ${publication.slug} ended ${job?.status}, not ${expected}: ${job?.lastError ?? ''}`);
  return access;
}

/**
 * Stands the project's settled `publish` job in for a converge that is still running and has already read the share list. Nothing
 * picks it up: dispatch skips a job that is not pending, and only a boot resets an in-progress one.
 */
export async function holdPublishJob(projectId: string): Promise<void> {
  const held = await novelForgeDb()`UPDATE jobs SET status = 'in_progress', updated_at = now() WHERE project_id = ${projectId} AND kind = 'publish' AND status = 'done'`;
  if (held.count !== 1) throw new ForgePublicationError(`no settled publish job to hold for project ${projectId}`);
}

export async function releasePublishJob(projectId: string): Promise<void> {
  await novelForgeDb()`UPDATE jobs SET status = 'done', updated_at = now() WHERE project_id = ${projectId} AND kind = 'publish' AND status = 'in_progress'`;
}

export function reconcileForge(publication: ForgePublication): Promise<APIResponse> {
  return mutate(publication.ctx, 'post', `/api/v1/projects/${publication.projectId}/publications/reconcile`);
}

/**
 * Settles any push still in flight first, or it could recreate the reader's row after it is deleted; every step still runs if an earlier
 * one fails. The reader's row is found by the forge's own `sourceRef` as well as the slug, since a converge that met a slug conflict would
 * have moved it.
 */
export async function removeForgePublication(ctx: APIRequestContext, projectId: string, slug: string): Promise<void> {
  const forgeSteps = projectId
    ? [
        () => settlePublishJob(projectId),
        async () => {
          const deleted = await mutate(ctx, 'delete', `/api/v1/projects/${projectId}`);
          if (deleted.status() !== 204 && deleted.status() !== 404) throw new ForgePublicationError(`project ${projectId} delete answered ${deleted.status()}`);
        },
        async () => {
          const moved = await webNovelDb()<{ slug: string }[]>`DELETE FROM novels WHERE source_client_id = ${FORGE_CLIENT_ID} AND source_ref = ${projectId} RETURNING slug`;
          await deleteNovels(moved.map(row => row.slug));
        },
      ]
    : [];
  await runAll([...forgeSteps, () => deleteNovels([slug])]);
}

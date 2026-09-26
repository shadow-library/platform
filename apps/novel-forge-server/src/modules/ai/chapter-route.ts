import { eq } from 'drizzle-orm';

import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { type ForgeCallPolicy, type PolicyCall } from '../plugins/plugin-policy.service';
import { type AiRole } from './defaults';
import { type ProjectConfig } from './model-router.service';
import { type CallRoute, resolveUnrestrictedRoute, type UnrestrictedRouteDeps } from './unrestricted-route';

export type ChapterRole = 'draft' | 'title' | 'judge' | 'repair' | 'revise' | 'review' | 'summary' | 'continuity' | 'extraction';

/**
 * Every model call that reads or writes one chapter's prose names its role here. The chapter's mode picks the model map for all of them
 * alike: a standard chapter is routed standard, an unrestricted one unrestricted, whatever the role.
 */
export const CHAPTER_ROUTE_TABLE: Readonly<Record<ChapterRole, AiRole>> = {
  draft: 'generation',
  title: 'title',
  judge: 'judge',
  repair: 'fix',
  revise: 'revision',
  review: 'review',
  summary: 'continuity',
  continuity: 'continuity',
  extraction: 'extraction',
};

export interface ChapterModeSource {
  brief?: { contentMode: Project.ContentMode | null } | null;
  /** The chapter's current prose is walled off; it stays on the unrestricted route whatever the plan now says. */
  isolated?: boolean;
}

/** The plan carries the mode (the project default is copied onto it when the plan is created), so flipping the default never re-routes a chapter. */
export function chapterContentMode({ brief, isolated }: ChapterModeSource): Project.ContentMode {
  if (isolated) return 'unrestricted';
  return brief?.contentMode ?? 'standard';
}

export async function defaultChapterMode(db: Pick<PrimaryDatabase, 'query'>, projectId: bigint): Promise<Project.ContentMode> {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { contentMode: true } });
  return project?.contentMode ?? 'standard';
}

export function chapterContainment(mode: Project.ContentMode, policy: Pick<ForgeCallPolicy, 'raised'>): { generator: 'unrestricted'; isolated: true } | Record<string, never> {
  return mode === 'unrestricted' || policy.raised ? { generator: 'unrestricted', isolated: true } : {};
}

/** For a call made without a plugin policy; the router's unrestricted branch confines it to the allowlist. */
export function chapterProjectConfig(project: ProjectConfig | undefined, mode: Project.ContentMode): ProjectConfig {
  return { ...project, contentMode: mode };
}

export interface ChapterRouteDeps extends UnrestrictedRouteDeps {
  /** How a standard-mode call resolves its plugin policy; a run passes its own scoped resolver so one read serves every node. */
  standardPolicy?: (projectId: bigint, call: PolicyCall) => Promise<ForgeCallPolicy>;
}

export interface ChapterCall {
  role: ChapterRole;
  chapter: number;
  mode: Project.ContentMode;
}

/**
 * The unrestricted branch never falls back: an off-allowlist model refuses the call (AI_003). The standard branch pins the project's mode to
 * standard, so an author who set one chapter of a dark book back to Standard gets standard models, while a plugin may still raise the call.
 */
export async function routeChapterCall(deps: ChapterRouteDeps, projectId: bigint, call: ChapterCall, project: ProjectConfig | undefined): Promise<CallRoute> {
  const policyCall = { role: CHAPTER_ROUTE_TABLE[call.role], chapter: call.chapter };
  if (call.mode === 'unrestricted') return resolveUnrestrictedRoute(deps, projectId, policyCall, project);
  const policy = deps.standardPolicy ? await deps.standardPolicy(projectId, policyCall) : await deps.pluginPolicy.resolve(projectId, policyCall, { contentMode: 'standard' });
  return { policy, project: { ...project, contentMode: 'standard' } };
}

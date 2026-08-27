/**
 * Importing npm packages
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, AUTH_DIR, type LoginPersona, mutate } from '../../lib';

/**
 * Defining types
 */

/** A per-role model override the project's `config.models` map accepts. */
export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

/** The subset of `POST /api/v1/import` a `final`-mode bundle needs — enough to author a valid one by hand. */
export interface NovelBundle {
  format: 'novel-import';
  schemaVersion: 1;
  mode: 'final' | 'source';
  novel: { title: string; synopsis: string; tags?: string[]; genre?: string; cover?: string };
  volumes: { ordinal: number; title?: string; chapters: { title: string; content: string }[] }[];
  assets?: { name: string; mimeType: string; dataBase64: string }[];
}

/**
 * Declaring the constants
 *
 * Shared building blocks for the Novel Forge specs: the Haiku model pin every AI test must apply, an
 * `aiAvailable()` gateway probe that caches its verdict so a whole run skips cleanly when the dev AI key is
 * absent, and a hand-authored `novel-import` bundle builder that lands a publishable novel without any AI.
 */

/**
 * Every text-generating AI role the settings UI exposes (novel-forge.md §0). An AI test must pin ALL of them
 * to Haiku: leaving one on the profile default routes that stage to grok-3 (xAI) and defeats the pin. `image`
 * and `embedding` are deliberately excluded — they are not text roles and their providers are left untouched.
 */
export const HAIKU_TEXT_ROLES = [
  'generation',
  'revision',
  'fix',
  'premise',
  'plan',
  'arc',
  'outline',
  'skeleton',
  'bible',
  'extraction',
  'judge',
  'validation',
  'continuity',
  'review',
  'audit',
  'chat',
  'title',
  'compact',
] as const;

/**
 * The undated id, on purpose. The deployed dev stack routes Anthropic through the host AI-CLI gateway whose
 * allowlist accepts exactly `claude-haiku-4-5`; the app's own MODEL_REGISTRY/settings dropdown offers the dated
 * `claude-haiku-4-5-20251001`, which that gateway rejects with a 400 (surfaced as AI_001). Sending the dated id
 * here would make every AI call fail — see the `workspace-ui` spec, which records that mismatch rather than
 * "fixing" it.
 */
export const HAIKU_MODEL: ModelRef = { provider: 'anthropic', model: 'claude-haiku-4-5' };

/** The `config.models` map that pins every text role to Haiku, for a `PATCH /api/v1/projects/:id` body. */
export function haikuModelConfig(): { models: Record<string, ModelRef> } {
  return { models: Object.fromEntries(HAIKU_TEXT_ROLES.map(role => [role, HAIKU_MODEL])) };
}

/** A collision-proof suffix for project names and slugs — the seed wipes e2e-owned projects each run, but a run may create several. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parses a response body as JSON, tolerating an empty body (204) by returning `undefined`. */
export async function jsonOrUndefined<T = Record<string, unknown>>(response: APIResponse): Promise<T | undefined> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : undefined;
}

/** Creates a project via the API and returns its id (as a string). `name` should already carry a unique suffix. */
export async function createProject(
  ctx: APIRequestContext,
  body: { name: string; kind: 'new_novel' | 'source'; title?: string; instructions?: string; contentMode?: 'standard' | 'unrestricted' },
): Promise<{ id: string; response: APIResponse }> {
  const response = await mutate(ctx, 'post', '/api/v1/projects', { data: body });
  const parsed = (await jsonOrUndefined<{ id: string }>(response)) ?? { id: '' };
  return { id: parsed.id, response };
}

/** Pins every text role of `projectId` to Haiku. Must run before any AI action (novel-forge.md §0). */
export async function pinHaiku(ctx: APIRequestContext, projectId: string): Promise<APIResponse> {
  return mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { config: haikuModelConfig() } });
}

/** Best-effort project delete — used to clean up probe/security scratch projects; never throws. */
export async function deleteProjectQuietly(ctx: APIRequestContext, projectId: string): Promise<void> {
  await mutate(ctx, 'delete', `/api/v1/projects/${projectId}`).catch(() => undefined);
}

/**
 * A minimal, valid `final`-mode novel-import bundle: one volume, three finalized chapters. `final` mode lands
 * the chapters locked/human-authored/publish-ready and never runs the source-mode recombine pass, so the three
 * distinct titles carry no merge risk. Three chapters (not two) let the publish spec exercise the
 * non-contiguous gate — publish 1, then attempt 3 → PUB_003.
 */
export function buildFinalBundle(title: string): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'final',
    novel: {
      title,
      synopsis: 'A retired lighthouse keeper discovers the tide itself is listening, and it wants the flame she has guarded for eleven winters.',
      tags: ['fantasy', 'slow-burn'],
      genre: 'fantasy',
    },
    volumes: [
      {
        ordinal: 1,
        title: 'The Quiet Coast',
        chapters: [
          {
            title: 'The Last Watch',
            content:
              'Mira climbed the spiral stair for what she told herself was the last time, though she had said that every winter for eleven years. The lamp room smelled of brass polish and salt. Below, the sea moved the way it always moved at dusk, patient and unhurried, listening. She set the wick, struck the flame, and watched the beam swing out across water the colour of old iron. Somewhere past the third reef a bell buoy answered, faint and out of time.',
          },
          {
            title: 'A Voice in the Foam',
            content:
              'The voice came again with the seventh wave, the way it always did. Mira had stopped telling herself it was the wind three years ago. "I know you are there," she said to the dark water, and for the first time in all those winters, something answered — not in words she could keep, but in the long slow pull of the tide against the rocks, a rhythm that spelled her grandmother\'s name.',
          },
          {
            title: 'What the Tide Keeps',
            content:
              "It wanted the lamp. Not the light it cast, but the fire itself, the one her grandmother had carried up these same stairs eighty years before. Mira understood, then, why the keeper's post had never once gone empty in three hundred years, and why it never would, until someone finally stood at the rail and said no. She wrapped both hands around the warm brass and, for the first time, considered what the sea would do if she did.",
          },
        ],
      },
    ],
  };
}

/**
 * Probes whether the dev AI gateway can actually service an Anthropic call. Creates a throwaway Haiku-pinned
 * project, fires the cheapest AI endpoint (`POST /premise/enhance` with a tiny brief), and caches the verdict
 * to `.auth/ai-probe.json` so every worker and spec in a run reuses one probe. A gateway/auth failure (AI_001
 * etc., or any non-2xx) caches a negative result — AI specs then `test.skip` with a clear reason rather than
 * failing on missing credentials.
 */
const AI_PROBE_CACHE = path.join(AUTH_DIR, 'ai-probe.json');
const AI_PROBE_TTL_MS = 20 * 60 * 1000;

export async function aiAvailable(persona: LoginPersona = 'user1'): Promise<boolean> {
  const cached = readProbeCache();
  if (cached !== undefined) return cached;

  const ctx = await apiContext('novelForge', persona);
  try {
    return writeProbeCache(await probeGateway(ctx));
  } finally {
    await ctx.dispose();
  }
}

/** Fires the cheapest AI endpoint on a throwaway project; any non-2xx (or thrown transport error) means unavailable. */
async function probeGateway(ctx: APIRequestContext): Promise<boolean> {
  let projectId = '';
  try {
    const created = await createProject(ctx, { name: `e2e-forge-aiprobe-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });
    projectId = created.id;
    if (!projectId) return false;
    await pinHaiku(ctx, projectId);
    // A short, self-contained overview satisfies the endpoint's 10-char minimum. A missing gateway key fails
    // fast (auth 400/500), it does not hang — so no special timeout is needed here.
    const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, {
      data: { overview: 'A lighthouse keeper discovers the light summons sea spirits.' },
    }).catch(() => undefined);
    return !!response && response.ok();
  } catch {
    return false;
  } finally {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
  }
}

function readProbeCache(): boolean | undefined {
  if (!existsSync(AI_PROBE_CACHE)) return undefined;
  try {
    const { available, ts } = JSON.parse(readFileSync(AI_PROBE_CACHE, 'utf8')) as { available: boolean; ts: number };
    return Date.now() - ts < AI_PROBE_TTL_MS ? available : undefined;
  } catch {
    return undefined;
  }
}

function writeProbeCache(available: boolean): boolean {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(AI_PROBE_CACHE, JSON.stringify({ available, ts: Date.now() }), 'utf8');
  return available;
}

/** The shared skip reason for every AI spec when the gateway probe comes back negative. */
export const AI_SKIP_REASON = 'AI gateway key not configured (AI_ANTHROPIC_API_KEY missing in dev secret)';

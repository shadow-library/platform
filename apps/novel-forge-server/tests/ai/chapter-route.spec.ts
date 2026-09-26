import { describe, expect, it } from 'bun:test';

import {
  CHAPTER_ROUTE_TABLE,
  chapterContainment,
  chapterContentMode,
  chapterProjectConfig,
  type ChapterRole,
  defaultChapterMode,
  routeChapterCall,
} from '@modules/ai/chapter-route';
import { PRODUCTION_DEFAULTS, type ResolvedModel, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';

const EXPECTED_ROLES: Record<ChapterRole, string> = {
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

const ROLES = Object.keys(EXPECTED_ROLES) as ChapterRole[];
const MODES = ['standard', 'unrestricted'] as const;
const CELLS = ROLES.flatMap(role => MODES.map(mode => [role, mode] as const));

function deps(model: (role: string, contentMode?: string) => ResolvedModel) {
  const baselines: unknown[] = [];
  const routed: { role: string; contentMode?: string }[] = [];
  return {
    baselines,
    routed,
    deps: {
      pluginPolicy: {
        resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string | null }) => {
          baselines.push(baseline?.contentMode);
          return { writerClass: baseline?.contentMode === 'unrestricted' ? 'permissive' : 'standard', raised: false } as never;
        },
      },
      modelRouter: {
        resolveFor: async (role: string, project?: { contentMode?: string }) => {
          routed.push({ role, contentMode: project?.contentMode });
          return model(role, project?.contentMode);
        },
      },
    },
  };
}

const tierModel = (role: string, contentMode?: string): ResolvedModel =>
  contentMode === 'unrestricted' ? UNRESTRICTED_DEFAULTS[role as 'judge'] : PRODUCTION_DEFAULTS[role as 'judge'];

describe('routeChapterCall across the role × mode table', () => {
  it.each(CELLS)('should route the %s call of a %s chapter as its model role on that mode’s map', async (role, mode) => {
    const run = deps(tierModel);

    const route = await routeChapterCall(run.deps, 1n, { role, chapter: 4, mode }, { contentMode: mode === 'standard' ? 'unrestricted' : 'standard' });

    expect(CHAPTER_ROUTE_TABLE[role]).toBe(EXPECTED_ROLES[role] as never);
    expect(route.project?.contentMode).toBe(mode);
    expect(run.baselines).toEqual([mode]);
    expect(run.routed).toEqual(mode === 'unrestricted' ? [{ role: EXPECTED_ROLES[role], contentMode: 'unrestricted' }] : []);
  });

  it.each(ROLES)('should refuse the %s call of an unrestricted chapter rather than fall back to a standard model', async role => {
    const run = deps(role => PRODUCTION_DEFAULTS[role as 'judge']);

    await expect(routeChapterCall(run.deps, 1n, { role, chapter: 4, mode: 'unrestricted' }, undefined)).rejects.toMatchObject({ code: 'AI_003' });
  });

  it('should resolve a standard call through the caller’s own policy when one is given', async () => {
    const run = deps(tierModel);
    const runPolicy = { writerClass: 'standard', raised: true } as never;

    const route = await routeChapterCall({ ...run.deps, standardPolicy: async () => runPolicy }, 1n, { role: 'judge', chapter: 4, mode: 'standard' }, undefined);

    expect(route.policy).toBe(runPolicy);
    expect(run.baselines).toEqual([]);
  });
});

describe('chapterContentMode', () => {
  it('should take the plan’s mode', () => {
    expect(chapterContentMode({ brief: { contentMode: 'standard' } })).toBe('standard');
    expect(chapterContentMode({ brief: { contentMode: 'unrestricted' } })).toBe('unrestricted');
  });

  it('should route a plan with no mode, or no plan, as standard', () => {
    expect(chapterContentMode({ brief: { contentMode: null } })).toBe('standard');
    expect(chapterContentMode({})).toBe('standard');
  });

  it('should keep walled-off prose on the unrestricted route even when the plan now says standard', () => {
    expect(chapterContentMode({ brief: { contentMode: 'standard' }, isolated: true })).toBe('unrestricted');
  });
});

describe('defaultChapterMode', () => {
  it('should read the project default a new plan starts from', async () => {
    const db = (contentMode?: string) => ({ query: { projects: { findFirst: async () => (contentMode ? { contentMode } : undefined) } } }) as never;

    expect(await defaultChapterMode(db('unrestricted'), 1n)).toBe('unrestricted');
    expect(await defaultChapterMode(db(), 1n)).toBe('standard');
  });
});

describe('chapterContainment', () => {
  it('should isolate prose written for an unrestricted chapter or by a raised call, and nothing else', () => {
    expect(chapterContainment('unrestricted', { raised: false })).toEqual({ generator: 'unrestricted', isolated: true });
    expect(chapterContainment('standard', { raised: true })).toEqual({ generator: 'unrestricted', isolated: true });
    expect(chapterContainment('standard', { raised: false })).toEqual({});
  });
});

describe('chapterProjectConfig', () => {
  it('should carry the given mode whatever the project default says', () => {
    expect(chapterProjectConfig({ contentMode: 'unrestricted' }, 'standard').contentMode).toBe('standard');
    expect(chapterProjectConfig({ contentMode: 'standard' }, 'unrestricted').contentMode).toBe('unrestricted');
  });
});

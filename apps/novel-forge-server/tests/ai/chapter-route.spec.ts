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

function deps() {
  const baselines: unknown[] = [];
  return {
    baselines,
    deps: {
      pluginPolicy: {
        resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string | null }) => {
          baselines.push(baseline?.contentMode);
          return { writerClass: baseline?.contentMode === 'unrestricted' ? 'permissive' : 'standard', raised: false } as never;
        },
      },
    },
  };
}

describe('routeChapterCall across the role × mode table', () => {
  it.each(CELLS)('should route the %s call of a %s chapter as its model role on that mode’s map', async (role, mode) => {
    const run = deps();

    const route = await routeChapterCall(run.deps, 1n, { role, chapter: 4, mode }, { contentMode: mode === 'standard' ? 'unrestricted' : 'standard' });

    expect(CHAPTER_ROUTE_TABLE[role]).toBe(EXPECTED_ROLES[role] as never);
    expect(route.project?.contentMode).toBe(mode);
    expect(run.baselines).toEqual([mode]);
  });

  it('should resolve a standard call through the caller’s own policy when one is given', async () => {
    const run = deps();
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

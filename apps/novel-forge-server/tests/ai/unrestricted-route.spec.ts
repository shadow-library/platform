import { describe, expect, it } from 'bun:test';

import { routeRunCall } from '@modules/ai/graphs/chapter-generation.graph';
import { type ProjectConfig } from '@modules/ai/model-router.service';
import { resolveUnrestrictedRoute } from '@modules/ai/unrestricted-route';

function deps() {
  const policyCalls: unknown[][] = [];
  const policy = { writerClass: 'permissive', raised: false };
  return {
    policy,
    policyCalls,
    deps: {
      pluginPolicy: {
        resolve: async (...args: unknown[]) => {
          policyCalls.push(args);
          return policy as never;
        },
      },
    },
  };
}

describe('resolveUnrestrictedRoute', () => {
  const project: ProjectConfig = { contentMode: 'standard', costTier: 'economy' };

  it('should resolve the policy on the unrestricted baseline and route the project onto the unrestricted map', async () => {
    const run = deps();

    const route = await resolveUnrestrictedRoute(run.deps, 1n, { role: 'revision', chapter: 4 }, project);

    expect(run.policyCalls).toEqual([[1n, { role: 'revision', chapter: 4 }, { contentMode: 'unrestricted' }]]);
    expect(route).toEqual({ policy: run.policy as never, project: { ...project, contentMode: 'unrestricted' } });
  });

  it('should route a call without a project row onto the unrestricted map', async () => {
    const run = deps();

    const route = await resolveUnrestrictedRoute(run.deps, 1n, { role: 'title' }, undefined);

    expect(route.project).toEqual({ contentMode: 'unrestricted' });
  });
});

describe('routeRunCall', () => {
  const projectRow: ProjectConfig = { contentMode: 'standard', costTier: 'economy' };
  const runPolicy = { writerClass: 'standard', raised: false };

  function runDeps() {
    const run = deps();
    const runPolicyCalls: unknown[][] = [];
    const routeDeps = {
      ...run.deps,
      runPolicy: async (...args: unknown[]) => {
        runPolicyCalls.push(args);
        return runPolicy as never;
      },
    };
    return { ...run, routeDeps, runPolicyCalls };
  }

  it.each(['title', 'judge', 'repair'] as const)('should route the %s call of a raised run onto the unrestricted map', async role => {
    const run = runDeps();

    const route = await routeRunCall(run.routeDeps, 1n, { role, chapter: 4, mode: 'standard', raised: true }, role === 'title' ? undefined : projectRow);

    expect(route.project?.contentMode).toBe('unrestricted');
    expect(route.policy).toBe(run.policy as never);
    expect(run.runPolicyCalls).toEqual([]);
  });

  it('should pass the project row and the run policy through unchanged for an unraised standard run', async () => {
    const run = runDeps();

    const route = await routeRunCall(run.routeDeps, 1n, { role: 'judge', chapter: 4, mode: 'standard', raised: false }, projectRow);

    expect(route).toEqual({ policy: runPolicy as never, project: projectRow });
    expect(run.runPolicyCalls).toEqual([[1n, { role: 'judge', chapter: 4 }]]);
    expect(run.policyCalls).toEqual([]);
  });
});

describe('routeRunCall on an unrestricted chapter', () => {
  it('should route an unraised call onto the unrestricted map without consulting the run policy', async () => {
    const run = deps();
    const runPolicyCalls: unknown[] = [];

    const route = await routeRunCall(
      { ...run.deps, runPolicy: async (...args) => (runPolicyCalls.push(args), run.policy as never) },
      1n,
      {
        role: 'judge',
        chapter: 4,
        mode: 'unrestricted',
        raised: false,
      },
      { contentMode: 'standard' },
    );

    expect(route.project?.contentMode).toBe('unrestricted');
    expect(runPolicyCalls).toEqual([]);
  });
});

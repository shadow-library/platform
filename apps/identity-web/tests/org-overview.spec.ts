import { describe, expect, it } from 'bun:test';

import { buildChecklist, buildTiles, type ChecklistSlices, pluralize, type QuerySlice, type TileSlices } from '../src/features/org-overview/overview-model';
import { orgGates } from '../src/features/portal/org-gates';
import { formatDate } from '../src/lib/format';
import { type MyOrganisation } from '../src/lib/apis';

const TEAM = {
  id: 'org-1',
  slug: 'shadow',
  name: 'Shadow',
  type: 'TEAM',
  status: 'ACTIVE',
  role: 'OWNER',
  isDefault: false,
  joinedAt: '2026-01-01T00:00:00.000Z',
} as MyOrganisation;
const PERSONAL = { ...TEAM, type: 'PERSONAL' } as MyOrganisation;

function ready<T>(data: T): QuerySlice<T> {
  return { data, isError: false };
}

function loading<T>(): QuerySlice<T> {
  return { data: undefined, isError: false };
}

function failed<T>(): QuerySlice<T> {
  return { data: undefined, isError: true };
}

function tileSlices(overrides: Partial<TileSlices> = {}): TileSlices {
  return {
    members: ready({ members: [{}, {}, {}] } as never),
    invitations: ready({ invitations: [{}] } as never),
    applications: ready({ appAccessMode: 'ASSIGNED_ONLY', applications: [{ assigned: true }, { assigned: false }, { assigned: true }] } as never),
    bots: ready({ bots: [{ status: 'ACTIVE' }, { status: 'ACTIVE' }, { status: 'SUSPENDED' }], usage: { count: 3, limit: 25 } } as never),
    domains: ready({ domains: [{ status: 'VERIFIED' }, { status: 'PENDING' }] } as never),
    ...overrides,
  };
}

function checklistSlices(overrides: Partial<ChecklistSlices> = {}): ChecklistSlices {
  return {
    domains: ready({ domains: [{ domain: 'shadow.example', status: 'VERIFIED', verifiedAt: '2026-10-24T00:00:00.000Z' }] } as never),
    providers: ready({ items: [] } as never),
    policies: ready({ policies: [{ type: 'integer', configuredValue: 8 }, { type: 'boolean' }] } as never),
    ...overrides,
  };
}

function keys(org: MyOrganisation, canManage: boolean, slices = tileSlices()): string[] {
  return buildTiles(orgGates(org, canManage), slices).map(tile => tile.key);
}

describe('orgGates', () => {
  it('should open every page and the checklist to a team manager', () => {
    expect(orgGates(TEAM, true)).toEqual({ invitations: true, applications: true, bots: true, domains: true, providers: true, security: true, checklist: true });
  });

  it('should leave a team member only the domains page', () => {
    const gates = orgGates({ ...TEAM, role: 'MEMBER' } as MyOrganisation, false);
    expect(gates).toEqual({ invitations: false, applications: false, bots: false, domains: true, providers: false, security: false, checklist: false });
  });

  it('should close everything on a personal workspace', () => {
    expect(Object.values(orgGates(PERSONAL, false)).every(open => !open)).toBe(true);
  });

  it('should close everything while the organization is unknown', () => {
    expect(Object.values(orgGates(null, false)).every(open => !open)).toBe(true);
  });
});

describe('pluralize', () => {
  it('should only add the s when the count is not one', () => {
    expect([pluralize(0, 'policy', 'policies'), pluralize(1, 'policy', 'policies'), pluralize(2, 'invitation')]).toEqual(['0 policies', '1 policy', '2 invitations']);
  });
});

describe('buildTiles', () => {
  it('should list all four tiles for a team manager', () => {
    expect(keys(TEAM, true)).toEqual(['members', 'applications', 'bots', 'domains']);
  });

  it('should list members and domains for a team member', () => {
    expect(keys({ ...TEAM, role: 'MEMBER' } as MyOrganisation, false)).toEqual(['members', 'domains']);
  });

  it('should list only members for a personal workspace', () => {
    expect(keys(PERSONAL, false)).toEqual(['members']);
  });

  it('should mention pending invitations on the members tile for managers', () => {
    const [members] = buildTiles(orgGates(TEAM, true), tileSlices());
    expect(members).toMatchObject({ value: 3, detail: '1 invitation pending' });
  });

  it('should say there are no pending invitations at zero and pluralise above one', () => {
    const none = buildTiles(orgGates(TEAM, true), tileSlices({ invitations: ready({ invitations: [] } as never) }))[0];
    const many = buildTiles(orgGates(TEAM, true), tileSlices({ invitations: ready({ invitations: [{}, {}] } as never) }))[0];
    expect([none?.detail, many?.detail]).toEqual(['No pending invitations', '2 invitations pending']);
  });

  it('should hide the invitation line from non-managers and while it loads or fails', () => {
    const member = buildTiles(orgGates(TEAM, false), tileSlices())[0];
    const pending = buildTiles(orgGates(TEAM, true), tileSlices({ invitations: loading() }))[0];
    const broken = buildTiles(orgGates(TEAM, true), tileSlices({ invitations: failed() }))[0];
    expect([member?.detail, pending?.detail, broken?.detail]).toEqual([null, null, null]);
  });

  it('should count assigned applications in managed mode and every application in open mode', () => {
    const [, managed] = buildTiles(orgGates(TEAM, true), tileSlices());
    const [, open] = buildTiles(
      orgGates(TEAM, true),
      tileSlices({ applications: ready({ appAccessMode: 'ALL_APPS', applications: [{ assigned: false }, { assigned: false }] } as never) }),
    );
    expect(managed).toMatchObject({ value: 2, detail: 'Assigned · managed access' });
    expect(open).toMatchObject({ value: 2, detail: 'Available · open access' });
  });

  it('should split bots into active and suspended', () => {
    const bots = buildTiles(orgGates(TEAM, true), tileSlices()).find(tile => tile.key === 'bots');
    expect(bots).toMatchObject({ value: 3, detail: '2 active · 1 suspended' });
  });

  it('should add deleting bots so the breakdown sums to the count', () => {
    const slices = tileSlices({ bots: ready({ bots: [{ status: 'ACTIVE' }, { status: 'DELETING' }], usage: { count: 2, limit: 25 } } as never) });
    expect(buildTiles(orgGates(TEAM, true), slices).find(tile => tile.key === 'bots')?.detail).toBe('1 active · 0 suspended · 1 deleting');
  });

  it('should say there are no bots yet at zero', () => {
    const slices = tileSlices({ bots: ready({ bots: [], usage: { count: 0, limit: 25 } } as never) });
    expect(buildTiles(orgGates(TEAM, true), slices).find(tile => tile.key === 'bots')).toMatchObject({ value: 0, detail: 'No bots yet' });
  });

  it('should count verified domains and note pending and failed ones', () => {
    const find = (domains: unknown[]) => buildTiles(orgGates(TEAM, true), tileSlices({ domains: ready({ domains } as never) })).find(tile => tile.key === 'domains');
    expect(find([{ status: 'VERIFIED' }, { status: 'PENDING' }])).toMatchObject({ value: 1, detail: '1 pending' });
    expect(find([{ status: 'PENDING' }, { status: 'FAILED' }])).toMatchObject({ value: 0, detail: '1 pending · 1 failed' });
    expect(find([{ status: 'VERIFIED' }])).toMatchObject({ value: 1, detail: 'All verified' });
    expect(find([])).toMatchObject({ value: 0, detail: 'None registered' });
  });

  it('should degrade each tile independently while loading or failed', () => {
    const tiles = buildTiles(orgGates(TEAM, true), tileSlices({ members: loading(), bots: failed() }));
    expect(tiles.map(tile => [tile.key, tile.state, tile.value])).toEqual([
      ['members', 'loading', null],
      ['applications', 'ready', 2],
      ['bots', 'error', null],
      ['domains', 'ready', 1],
    ]);
  });

  it('should keep stale data visible when a refetch fails', () => {
    const slices = tileSlices({ members: { data: { members: [{}] } as never, isError: true } });
    expect(buildTiles(orgGates(TEAM, true), slices)[0]).toMatchObject({ state: 'ready', value: 1 });
  });
});

describe('buildChecklist', () => {
  it('should mark rows done from domains and configured policies and todo without a provider', () => {
    const checklist = buildChecklist(checklistSlices());
    expect(checklist.rows.map(row => [row.key, row.status])).toEqual([
      ['domain', 'done'],
      ['sso', 'todo'],
      ['policies', 'done'],
    ]);
    expect(checklist.done).toBe(2);
    expect(checklist.summary).toBe('2 of 3 done');
  });

  it('should name the single verified domain with its date', () => {
    expect(buildChecklist(checklistSlices()).rows[0]?.detail).toBe(`shadow.example verified ${formatDate('2026-10-24T00:00:00.000Z')}.`);
  });

  it('should count several verified domains', () => {
    const domains = ready({ domains: [{ status: 'VERIFIED' }, { status: 'VERIFIED' }] } as never);
    expect(buildChecklist(checklistSlices({ domains })).rows[0]?.detail).toBe('2 domains verified.');
  });

  it('should keep the domain row todo while only pending domains exist', () => {
    const domains = ready({ domains: [{ status: 'PENDING' }] } as never);
    expect(buildChecklist(checklistSlices({ domains })).rows[0]?.status).toBe('todo');
  });

  it('should treat policies that all inherit the default as todo', () => {
    const policies = ready({ policies: [{ type: 'integer' }, { type: 'boolean' }] } as never);
    expect(buildChecklist(checklistSlices({ policies })).rows[2]?.status).toBe('todo');
  });

  it('should read configuration by policy type', () => {
    const policies = ready({ policies: [{ type: 'boolean', configuredEnabled: false }] } as never);
    expect(buildChecklist(checklistSlices({ policies })).rows[2]).toMatchObject({ status: 'done', detail: '1 policy set for this organization.' });
  });

  it('should mark a provider as done', () => {
    const providers = ready({ items: [{}, {}] } as never);
    expect(buildChecklist(checklistSlices({ providers })).rows[1]).toMatchObject({ status: 'done', detail: '2 identity providers connected.' });
  });

  it('should withhold the progress summary while a row loads', () => {
    const checklist = buildChecklist(checklistSlices({ providers: loading() }));
    expect(checklist.rows[1]?.status).toBe('loading');
    expect(checklist.summary).toBeNull();
  });

  it('should report an unavailable row as unknown without blocking the summary', () => {
    const checklist = buildChecklist(checklistSlices({ policies: failed() }));
    expect(checklist.rows[2]?.status).toBe('unknown');
    expect(checklist.summary).toBe('1 of 3 done');
  });
});

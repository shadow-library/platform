import { describe, expect, it } from 'bun:test';

import { type BotCatalogApplicationItem, type BotCatalogLevelItem, type BotGrantItem } from '../src/lib/apis';
import {
  baselineFromGrants,
  catalogLevelsBySlot,
  classifyGrant,
  countChangedSlots,
  countFlaggedGrants,
  countGrantsByApplication,
  type DesiredGrantMap,
  desiredGrantsList,
  humanizeResource,
  levelLabel,
  resolvedNotHeldRemovals,
  resolvedStaleRemovals,
  slotKey,
  staleLevelGrants,
  summarizeGrants,
  summarizePermissions,
  unrepresentableManagedGrantCount,
  unresolvedNotHeldGrants,
} from '../src/lib/bot-permissions';

const level = (lvl: 'read' | 'write', overrides: Partial<BotCatalogLevelItem> = {}): BotCatalogLevelItem => ({
  roleId: lvl === 'read' ? 1 : 2,
  roleName: `role-${lvl}`,
  level: lvl,
  sensitive: false,
  eligible: true,
  heldByYou: true,
  ...overrides,
});

const grant = (overrides: Partial<BotGrantItem> = {}): BotGrantItem => ({
  roleId: 1,
  roleName: 'role',
  applicationId: 1,
  application: 'crm',
  resource: 'members',
  level: 'read',
  sensitive: false,
  eligible: true,
  grantedAt: '2026-01-01T00:00:00.000Z',
  granterHoldsPermission: true,
  managed: true,
  ...overrides,
});

const catalog = (levels: BotCatalogLevelItem[] = [level('read'), level('write')]): BotCatalogApplicationItem[] => [
  { applicationId: 1, name: 'crm', displayName: 'CRM', resources: [{ resource: 'members', levels }] },
];

describe('slotKey', () => {
  it('should join application and resource', () => {
    expect(slotKey(7, 'members')).toBe('7:members');
  });
});

describe('catalogLevelsBySlot', () => {
  it('should index levels by application and resource', () => {
    const map = catalogLevelsBySlot(catalog());
    expect(map.get('1:members')?.map(item => item.level)).toEqual(['read', 'write']);
    expect(map.size).toBe(1);
  });
});

describe('classifyGrant', () => {
  const levels = catalogLevelsBySlot(catalog());

  it('should return null when resource is missing', () => {
    expect(classifyGrant(levels, grant({ resource: undefined }))).toBeNull();
  });

  it('should return null when level is missing', () => {
    expect(classifyGrant(levels, grant({ level: undefined }))).toBeNull();
  });

  it('should check the missing-name guard before managed', () => {
    expect(classifyGrant(levels, grant({ resource: undefined, managed: false }))).toBeNull();
  });

  it('should return locked for an unmanaged grant', () => {
    expect(classifyGrant(levels, grant({ managed: false }))).toBe('locked');
  });

  it('should return locked for an unmanaged grant even when the catalog lacks it', () => {
    expect(classifyGrant(new Map(), grant({ managed: false }))).toBe('locked');
  });

  it('should return ineligible when the resource is gone from the catalog', () => {
    expect(classifyGrant(new Map(), grant())).toBe('ineligible');
  });

  it('should return ineligible when the catalog lacks that exact level', () => {
    expect(classifyGrant(catalogLevelsBySlot(catalog([level('read')])), grant({ level: 'write' }))).toBe('ineligible');
  });

  it('should return ineligible for another application with the same resource', () => {
    expect(classifyGrant(levels, grant({ applicationId: 2 }))).toBe('ineligible');
  });

  it('should return not-held when the viewer does not hold the level', () => {
    expect(classifyGrant(catalogLevelsBySlot(catalog([level('read', { heldByYou: false })])), grant())).toBe('not-held');
  });

  it('should return null for a fully editable grant', () => {
    expect(classifyGrant(levels, grant())).toBeNull();
  });

  it('should not consult the eligible flag', () => {
    expect(classifyGrant(catalogLevelsBySlot(catalog([level('read', { eligible: false })])), grant())).toBeNull();
  });
});

describe('baselineFromGrants', () => {
  it('should seed an editable grant', () => {
    expect(baselineFromGrants(catalog(), [grant()])).toEqual({ '1:members': { applicationId: 1, resource: 'members', level: 'read' } });
  });

  it('should skip locked, ineligible, not-held and nameless grants', () => {
    const apps = catalog([level('read'), level('write', { heldByYou: false })]);
    const grants = [grant({ managed: false }), grant({ resource: 'gone' }), grant({ level: 'write' }), grant({ resource: undefined }), grant({ level: undefined })];
    expect(baselineFromGrants(apps, grants)).toEqual({});
  });

  it('should keep the higher level when two grants share a slot, in either order', () => {
    const read = grant({ level: 'read' });
    const write = grant({ level: 'write', roleId: 2 });
    expect(baselineFromGrants(catalog(), [read, write])['1:members']?.level).toBe('write');
    expect(baselineFromGrants(catalog(), [write, read])['1:members']?.level).toBe('write');
  });

  it('should keep separate slots separate', () => {
    const apps: BotCatalogApplicationItem[] = [
      {
        applicationId: 1,
        name: 'a',
        resources: [
          { resource: 'x', levels: [level('read')] },
          { resource: 'y', levels: [level('read')] },
        ],
      },
      { applicationId: 2, name: 'b', resources: [{ resource: 'x', levels: [level('read')] }] },
    ];
    const result = baselineFromGrants(apps, [grant({ resource: 'x' }), grant({ resource: 'y' }), grant({ applicationId: 2, resource: 'x' })]);
    expect(Object.keys(result).sort()).toEqual(['1:x', '1:y', '2:x']);
  });

  it('should return an empty map for no grants', () => {
    expect(baselineFromGrants(catalog(), [])).toEqual({});
  });
});

describe('desiredGrantsList', () => {
  it('should drop null entries', () => {
    const desired: DesiredGrantMap = { a: { applicationId: 1, resource: 'x', level: 'read' }, b: null };
    expect(desiredGrantsList(desired)).toEqual([{ applicationId: 1, resource: 'x', level: 'read' }]);
  });

  it('should return an empty list for an empty map', () => {
    expect(desiredGrantsList({})).toEqual([]);
  });
});

describe('countChangedSlots', () => {
  const read = { applicationId: 1, resource: 'x', level: 'read' as const };
  const write = { applicationId: 1, resource: 'x', level: 'write' as const };

  it('should count zero for identical maps', () => {
    expect(countChangedSlots({ a: read }, { a: { ...read } })).toBe(0);
  });

  it('should count an added slot', () => {
    expect(countChangedSlots({}, { a: read })).toBe(1);
  });

  it('should count a removed slot', () => {
    expect(countChangedSlots({ a: read }, {})).toBe(1);
  });

  it('should count a level change once', () => {
    expect(countChangedSlots({ a: read }, { a: write })).toBe(1);
  });

  it('should treat an explicit null as no entry', () => {
    expect(countChangedSlots({}, { a: null })).toBe(0);
    expect(countChangedSlots({ a: read }, { a: null })).toBe(1);
  });

  it('should count each differing slot across both maps', () => {
    expect(countChangedSlots({ a: read, b: read }, { b: write, c: read })).toBe(3);
  });
});

describe('stale and not-held resolution', () => {
  const read = { applicationId: 1, resource: 'members', level: 'read' as const };
  const write = { applicationId: 1, resource: 'members', level: 'write' as const };
  const notHeldApps = catalog([level('read', { heldByYou: false })]);
  const staleApps = catalog([level('write')]);

  it('should list an untouched not-held grant as unresolved', () => {
    const entries = unresolvedNotHeldGrants(notHeldApps, [grant()], {}, {});
    expect(entries).toEqual([{ applicationId: 1, applicationName: 'CRM', resource: 'members', resourceLabel: 'Members', levelLabel: 'Read', hasSibling: false }]);
  });

  it('should treat explicit null as resolved', () => {
    expect(unresolvedNotHeldGrants(notHeldApps, [grant()], {}, { '1:members': null })).toEqual([]);
  });

  it('should treat a changed level as resolved', () => {
    expect(unresolvedNotHeldGrants(notHeldApps, [grant()], {}, { '1:members': write })).toEqual([]);
  });

  it('should keep a not-held grant unresolved while a sibling seed is untouched, flagging the sibling', () => {
    const entries = unresolvedNotHeldGrants(notHeldApps, [grant()], { '1:members': write }, { '1:members': write });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.hasSibling).toBe(true);
  });

  it('should ignore grants that are not not-held', () => {
    expect(unresolvedNotHeldGrants(catalog(), [grant(), grant({ managed: false }), grant({ resource: undefined })], {}, {})).toEqual([]);
  });

  it('should list an untouched stale-level grant', () => {
    const entries = staleLevelGrants(staleApps, [grant({ level: 'read' })], {}, {});
    expect(entries).toHaveLength(1);
    expect(entries[0]?.levelLabel).toBe('Read');
  });

  it('should resolve a stale grant by null or by a different level', () => {
    expect(staleLevelGrants(staleApps, [grant()], { '1:members': write }, { '1:members': null })).toEqual([]);
    expect(staleLevelGrants(staleApps, [grant()], { '1:members': write }, { '1:members': write })).toHaveLength(1);
    expect(staleLevelGrants(staleApps, [grant()], {}, { '1:members': read })).toEqual([]);
  });

  it('should ignore non-ineligible grants in staleLevelGrants', () => {
    expect(staleLevelGrants(catalog(), [grant(), grant({ managed: false })], {}, {})).toEqual([]);
  });

  it('should fall back through application name sources', () => {
    const noNames: BotCatalogApplicationItem[] = [{ applicationId: 1, name: 'crm-name', resources: [{ resource: 'members', levels: [level('write')] }] }];
    expect(staleLevelGrants(noNames, [grant()], {}, {})[0]?.applicationName).toBe('crm-name');
    const unknownApp = staleLevelGrants([], [grant({ applicationDisplayName: 'Display' })], {}, {});
    expect(unknownApp[0]?.applicationName).toBe('Display');
    expect(staleLevelGrants([], [grant()], {}, {})[0]?.applicationName).toBe('crm');
    const missingApp: BotCatalogApplicationItem[] = [{ applicationId: 9, name: 'other', resources: [{ resource: 'members', levels: [] }] }];
    expect(staleLevelGrants(missingApp, [grant({ applicationId: 9, application: 'raw' })], {}, {})[0]?.applicationName).toBe('other');
  });

  it('should label the write level using the catalog read level, or the grant level when the slot is unknown', () => {
    const withRead = catalog([level('read'), level('write', { heldByYou: false })]);
    expect(unresolvedNotHeldGrants(withRead, [grant({ level: 'write' })], {}, {})[0]?.levelLabel).toBe('Read & write');
    const writeOnly = catalog([level('write', { heldByYou: false })]);
    expect(unresolvedNotHeldGrants(writeOnly, [grant({ level: 'write' })], {}, {})[0]?.levelLabel).toBe('Write');
  });

  it('should count explicit not-held removals', () => {
    expect(resolvedNotHeldRemovals(notHeldApps, [grant()], { '1:members': null })).toBe(1);
    expect(resolvedNotHeldRemovals(notHeldApps, [grant()], {})).toBe(0);
    expect(resolvedNotHeldRemovals(notHeldApps, [grant()], { '1:members': read })).toBe(0);
    expect(resolvedNotHeldRemovals(catalog(), [grant()], { '1:members': null })).toBe(0);
  });

  it('should count each not-held grant sharing a nulled slot', () => {
    const apps = catalog([level('read', { heldByYou: false }), level('write', { heldByYou: false })]);
    expect(resolvedNotHeldRemovals(apps, [grant(), grant({ level: 'write' })], { '1:members': null })).toBe(2);
  });

  it('should count explicit stale removals', () => {
    expect(resolvedStaleRemovals(staleApps, [grant()], { '1:members': null })).toBe(1);
    expect(resolvedStaleRemovals(staleApps, [grant()], {})).toBe(0);
    expect(resolvedStaleRemovals(catalog(), [grant()], { '1:members': null })).toBe(0);
  });

  it('should skip nameless grants in the removal counts', () => {
    expect(resolvedStaleRemovals(staleApps, [grant({ resource: undefined })], { x: null })).toBe(0);
    expect(resolvedNotHeldRemovals(notHeldApps, [grant({ level: undefined })], { x: null })).toBe(0);
  });
});

describe('summarizePermissions', () => {
  it('should group desired grants under their application', () => {
    const desired: DesiredGrantMap = { '1:members': { applicationId: 1, resource: 'members', level: 'write' } };
    expect(summarizePermissions(catalog(), desired)).toEqual([
      { applicationId: 1, applicationName: 'CRM', items: [{ resource: 'members', resourceLabel: 'Members', levelLabel: 'Read & write', flagged: false }] },
    ]);
  });

  it('should label write as Write when the catalog has no read level or the resource is unknown', () => {
    const desired: DesiredGrantMap = { a: { applicationId: 1, resource: 'members', level: 'write' }, b: { applicationId: 1, resource: 'ghost', level: 'write' } };
    const items = summarizePermissions(catalog([level('write')]), desired)[0]?.items;
    expect(items?.map(item => item.levelLabel)).toEqual(['Write', 'Write']);
    expect(summarizePermissions(catalog(), { b: { applicationId: 1, resource: 'ghost', level: 'write' } })[0]?.items[0]?.levelLabel).toBe('Write');
  });

  it('should skip nulls and grants for applications outside the catalog', () => {
    expect(summarizePermissions(catalog(), { a: null, b: { applicationId: 99, resource: 'x', level: 'read' } })).toEqual([]);
  });

  it('should fall back to the application name when there is no display name', () => {
    const apps: BotCatalogApplicationItem[] = [{ applicationId: 1, name: 'crm', resources: [] }];
    expect(summarizePermissions(apps, { a: { applicationId: 1, resource: 'x', level: 'read' } })[0]?.applicationName).toBe('crm');
  });
});

describe('summarizeGrants', () => {
  it('should flag grants whose granter lost the permission', () => {
    const groups = summarizeGrants(catalog(), [grant(), grant({ resource: 'billing', granterHoldsPermission: false })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map(item => item.flagged)).toEqual([false, true]);
    expect(groups[0]?.applicationName).toBe('crm');
  });

  it('should prefer the grant display name', () => {
    expect(summarizeGrants(catalog(), [grant({ applicationDisplayName: 'Display' })])[0]?.applicationName).toBe('Display');
  });

  it('should skip nameless grants and group by application', () => {
    const groups = summarizeGrants(catalog(), [grant({ resource: undefined }), grant({ applicationId: 2, application: 'b' }), grant()]);
    expect(groups.map(group => group.applicationId)).toEqual([2, 1]);
  });

  it('should use the grant level to label when the catalog slot is unknown', () => {
    expect(summarizeGrants([], [grant({ level: 'read' })])[0]?.items[0]?.levelLabel).toBe('Read');
    expect(summarizeGrants([], [grant({ level: 'write' })])[0]?.items[0]?.levelLabel).toBe('Write');
  });
});

describe('countGrantsByApplication', () => {
  it('should count named grants per application', () => {
    expect(countGrantsByApplication([grant(), grant({ resource: 'b' }), grant({ applicationId: 2, application: 'x', applicationDisplayName: 'X' })])).toEqual([
      { applicationId: 1, applicationName: 'crm', count: 2 },
      { applicationId: 2, applicationName: 'X', count: 1 },
    ]);
  });

  it('should skip nameless grants', () => {
    expect(countGrantsByApplication([grant({ resource: undefined }), grant({ level: undefined })])).toEqual([]);
  });
});

describe('countFlaggedGrants', () => {
  it('should count grants whose granter no longer holds the permission, nameless included', () => {
    expect(countFlaggedGrants([grant(), grant({ granterHoldsPermission: false }), grant({ granterHoldsPermission: false, resource: undefined })])).toBe(2);
  });
});

describe('unrepresentableManagedGrantCount', () => {
  it('should count only managed grants lacking a resource or level', () => {
    const grants = [grant(), grant({ resource: undefined }), grant({ level: undefined }), grant({ resource: undefined, managed: false })];
    expect(unrepresentableManagedGrantCount(grants)).toBe(2);
  });
});

describe('humanizeResource', () => {
  it.each([
    ['members', 'Members'],
    ['audit-logs', 'Audit Logs'],
    ['audit_logs', 'Audit Logs'],
    ['audit logs', 'Audit Logs'],
    ['a--b__c  d', 'A B C D'],
    ['-lead', 'Lead'],
    ['', ''],
    ['ALREADY', 'ALREADY'],
  ])('should humanize %p', (input, expected) => {
    expect(humanizeResource(input)).toBe(expected);
  });
});

describe('levelLabel', () => {
  it('should label read', () => {
    expect(levelLabel('read', true)).toBe('Read');
    expect(levelLabel('read', false)).toBe('Read');
  });

  it('should label write by whether a read level exists', () => {
    expect(levelLabel('write', true)).toBe('Read & write');
    expect(levelLabel('write', false)).toBe('Write');
  });
});

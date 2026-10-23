import { type BotCatalogApplicationItem, type BotCatalogLevelItem, type BotGrantBody, type BotGrantItem, type BotGrantLevel } from './apis';

/** `undefined` is untouched; `null` is an explicit "No access", the only way to resolve a not-held grant. */
export type DesiredGrantMap = Record<string, BotGrantBody | null>;

export const LEVEL_ORDER: Record<BotGrantLevel, number> = { read: 0, write: 1 };

export function slotKey(applicationId: number, resource: string): string {
  return `${applicationId}:${resource}`;
}

export function catalogLevelsBySlot(applications: BotCatalogApplicationItem[]): Map<string, BotCatalogLevelItem[]> {
  const map = new Map<string, BotCatalogLevelItem[]>();
  for (const app of applications) for (const resource of app.resources) map.set(slotKey(app.applicationId, resource.resource), resource.levels);
  return map;
}

export type GrantExclusionReason = 'locked' | 'ineligible' | 'not-held' | null;

export function classifyGrant(catalogLevels: Map<string, BotCatalogLevelItem[]>, grant: BotGrantItem): GrantExclusionReason {
  const { resource, level, managed } = grant;
  if (resource === undefined || level === undefined) return null;
  if (!managed) return 'locked';
  const catalogLevel = catalogLevels.get(slotKey(grant.applicationId, resource))?.find(item => item.level === level);
  if (!catalogLevel) return 'ineligible';
  if (!catalogLevel.heldByYou) return 'not-held';
  return null;
}

/** Seeds only managed, catalogued, viewer-held grants; the rest render read-only or block the save. */
export function baselineFromGrants(applications: BotCatalogApplicationItem[], grants: BotGrantItem[]): DesiredGrantMap {
  const catalogLevels = catalogLevelsBySlot(applications);
  const map: DesiredGrantMap = {};
  for (const grant of grants) {
    const { resource, level } = grant;
    if (resource === undefined || level === undefined) continue;
    if (classifyGrant(catalogLevels, grant) !== null) continue;
    const key = slotKey(grant.applicationId, resource);
    const existing = map[key];
    if (existing && LEVEL_ORDER[existing.level] >= LEVEL_ORDER[level]) continue;
    map[key] = { applicationId: grant.applicationId, resource, level };
  }
  return map;
}

export function desiredGrantsList(desired: DesiredGrantMap): BotGrantBody[] {
  return Object.values(desired).filter((grant): grant is BotGrantBody => grant !== null);
}

export function countChangedSlots(baseline: DesiredGrantMap, desired: DesiredGrantMap): number {
  const slots = new Set([...Object.keys(baseline), ...Object.keys(desired)]);
  let count = 0;
  for (const slot of slots) if (baseline[slot]?.level !== desired[slot]?.level) count += 1;
  return count;
}

export interface ExcludedGrantEntry {
  applicationId: number;
  applicationName: string;
  resource: string;
  resourceLabel: string;
  levelLabel: string;
  /** A sibling grant shares this slot (via `baseline`) and would also be cleared by removing this one. */
  hasSibling: boolean;
}

function toExcludedEntry(
  applications: BotCatalogApplicationItem[],
  catalogLevels: Map<string, BotCatalogLevelItem[]>,
  grant: BotGrantItem,
  resource: string,
  level: BotGrantLevel,
  hasSibling: boolean,
): ExcludedGrantEntry {
  const app = applications.find(item => item.applicationId === grant.applicationId);
  const hasReadLevel = catalogLevels.get(slotKey(grant.applicationId, resource))?.some(item => item.level === 'read') ?? level === 'read';
  return {
    applicationId: grant.applicationId,
    applicationName: app?.displayName ?? app?.name ?? grant.applicationDisplayName ?? grant.application,
    resource,
    resourceLabel: humanizeResource(resource),
    levelLabel: levelLabel(level, hasReadLevel),
    hasSibling,
  };
}

/** Grants on a catalogued resource whose exact level stopped being bot-grantable; always dropped on save. */
export function staleLevelGrants(applications: BotCatalogApplicationItem[], grants: BotGrantItem[], baseline: DesiredGrantMap, desired: DesiredGrantMap): ExcludedGrantEntry[] {
  const catalogLevels = catalogLevelsBySlot(applications);
  const entries: ExcludedGrantEntry[] = [];
  for (const grant of grants) {
    const { resource, level } = grant;
    if (resource === undefined || level === undefined) continue;
    if (classifyGrant(catalogLevels, grant) !== 'ineligible') continue;
    const slot = slotKey(grant.applicationId, resource);
    const desiredEntry = desired[slot];
    const resolved = desiredEntry === null || desiredEntry?.level !== baseline[slot]?.level;
    if (resolved) continue;
    entries.push(toExcludedEntry(applications, catalogLevels, grant, resource, level, baseline[slot] !== undefined));
  }
  return entries;
}

/** Resolution is per grant: compare against baseline, since a higher sibling grant can seed desired[slot] untouched. */
export function unresolvedNotHeldGrants(
  applications: BotCatalogApplicationItem[],
  grants: BotGrantItem[],
  baseline: DesiredGrantMap,
  desired: DesiredGrantMap,
): ExcludedGrantEntry[] {
  const catalogLevels = catalogLevelsBySlot(applications);
  const entries: ExcludedGrantEntry[] = [];
  for (const grant of grants) {
    const { resource, level } = grant;
    if (resource === undefined || level === undefined) continue;
    if (classifyGrant(catalogLevels, grant) !== 'not-held') continue;
    const slot = slotKey(grant.applicationId, resource);
    const desiredEntry = desired[slot];
    const resolved = desiredEntry === null || desiredEntry?.level !== baseline[slot]?.level;
    if (resolved) continue;
    entries.push(toExcludedEntry(applications, catalogLevels, grant, resource, level, baseline[slot] !== undefined));
  }
  return entries;
}

/** An explicit "No access" on a not-held grant looks identical to the baseline, so countChangedSlots misses it. */
export function resolvedNotHeldRemovals(applications: BotCatalogApplicationItem[], grants: BotGrantItem[], desired: DesiredGrantMap): number {
  const catalogLevels = catalogLevelsBySlot(applications);
  let count = 0;
  for (const grant of grants) {
    const { resource, level } = grant;
    if (resource === undefined || level === undefined) continue;
    if (classifyGrant(catalogLevels, grant) !== 'not-held') continue;
    if (desired[slotKey(grant.applicationId, resource)] === null) count += 1;
  }
  return count;
}

export function resolvedStaleRemovals(applications: BotCatalogApplicationItem[], grants: BotGrantItem[], desired: DesiredGrantMap): number {
  const catalogLevels = catalogLevelsBySlot(applications);
  let count = 0;
  for (const grant of grants) {
    const { resource, level } = grant;
    if (resource === undefined || level === undefined) continue;
    if (classifyGrant(catalogLevels, grant) !== 'ineligible') continue;
    if (desired[slotKey(grant.applicationId, resource)] === null) count += 1;
  }
  return count;
}

export interface PermissionSummaryEntry {
  resource: string;
  resourceLabel: string;
  levelLabel: string;
  flagged: boolean;
}

export interface PermissionSummaryGroup {
  applicationId: number;
  applicationName: string;
  items: PermissionSummaryEntry[];
}

export function summarizePermissions(applications: BotCatalogApplicationItem[], desired: DesiredGrantMap): PermissionSummaryGroup[] {
  const groups = new Map<number, PermissionSummaryGroup>();
  for (const app of applications) {
    const resourceLevels = new Map(app.resources.map(resource => [resource.resource, resource.levels] as const));
    for (const grant of Object.values(desired)) {
      if (grant === null || grant.applicationId !== app.applicationId) continue;
      const levels = resourceLevels.get(grant.resource);
      const hasReadLevel = levels?.some(level => level.level === 'read') ?? false;
      const group = groups.get(app.applicationId) ?? { applicationId: app.applicationId, applicationName: app.displayName ?? app.name, items: [] };
      group.items.push({ resource: grant.resource, resourceLabel: humanizeResource(grant.resource), levelLabel: levelLabel(grant.level, hasReadLevel), flagged: false });
      groups.set(app.applicationId, group);
    }
  }
  return [...groups.values()];
}

export function summarizeGrants(applications: BotCatalogApplicationItem[], grants: BotGrantItem[]): PermissionSummaryGroup[] {
  const catalogLevels = catalogLevelsBySlot(applications);
  const groups = new Map<number, PermissionSummaryGroup>();
  for (const grant of grants) {
    if (grant.resource === undefined || grant.level === undefined) continue;
    const levels = catalogLevels.get(slotKey(grant.applicationId, grant.resource));
    const hasReadLevel = levels?.some(level => level.level === 'read') ?? grant.level === 'read';
    const group = groups.get(grant.applicationId) ?? { applicationId: grant.applicationId, applicationName: grant.applicationDisplayName ?? grant.application, items: [] };
    group.items.push({
      resource: grant.resource,
      resourceLabel: humanizeResource(grant.resource),
      levelLabel: levelLabel(grant.level, hasReadLevel),
      flagged: !grant.granterHoldsPermission,
    });
    groups.set(grant.applicationId, group);
  }
  return [...groups.values()];
}

export interface ApplicationGrantCount {
  applicationId: number;
  applicationName: string;
  count: number;
}

export function countGrantsByApplication(grants: BotGrantItem[]): ApplicationGrantCount[] {
  const counts = new Map<number, ApplicationGrantCount>();
  for (const grant of grants) {
    if (grant.resource === undefined || grant.level === undefined) continue;
    const existing = counts.get(grant.applicationId) ?? { applicationId: grant.applicationId, applicationName: grant.applicationDisplayName ?? grant.application, count: 0 };
    existing.count += 1;
    counts.set(grant.applicationId, existing);
  }
  return [...counts.values()];
}

export function countFlaggedGrants(grants: BotGrantItem[]): number {
  return grants.filter(grant => !grant.granterHoldsPermission).length;
}

/** Managed grants with no resource or level have no row; any save drops them. */
export function unrepresentableManagedGrantCount(grants: BotGrantItem[]): number {
  return grants.filter(grant => grant.managed && (grant.resource === undefined || grant.level === undefined)).length;
}

export function humanizeResource(resource: string): string {
  return resource
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function levelLabel(level: BotGrantLevel, hasReadLevel: boolean): string {
  if (level === 'read') return 'Read';
  return hasReadLevel ? 'Read & write' : 'Write';
}

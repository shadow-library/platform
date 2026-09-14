import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, SegmentedControl } from '@shadow-library/ui';

import { type BotCatalogApplicationItem, type BotCatalogLevelItem, type BotCatalogResourceItem, type BotGrantBody, type BotGrantItem, type BotGrantLevel } from '@/lib/apis';

import styles from './permissions-matrix.module.css';

/**
 * `undefined` means the admin hasn't touched this slot (its display falls back to whatever is true on
 * the server); `null` is an explicit "No access" (the only way to resolve a not-held grant, since the
 * server has no way to represent "leave someone else's grant alone" other than omitting it and no way
 * to distinguish "never touched" from "deleted" other than this sentinel).
 */
export type DesiredGrantMap = Record<string, BotGrantBody | null>;

const LEVEL_ORDER: Record<BotGrantLevel, number> = { read: 0, write: 1 };

export function slotKey(applicationId: number, resource: string): string {
  return `${applicationId}:${resource}`;
}

function catalogLevelsBySlot(applications: BotCatalogApplicationItem[]): Map<string, BotCatalogLevelItem[]> {
  const map = new Map<string, BotCatalogLevelItem[]>();
  for (const app of applications) for (const resource of app.resources) map.set(slotKey(app.applicationId, resource.resource), resource.levels);
  return map;
}

export type GrantExclusionReason = 'locked' | 'ineligible' | 'not-held' | null;

/**
 * `null` covers both "fully editable" and "orphaned" (no resource/level, or the resource itself is gone
 * from the catalog) — callers that need to tell those apart already know which grants have a resource
 * and level and which don't, and check catalog-slot membership themselves (see `orphanGrants`).
 */
export function classifyGrant(catalogLevels: Map<string, BotCatalogLevelItem[]>, grant: BotGrantItem): GrantExclusionReason {
  const { resource, level, managed } = grant;
  if (resource === undefined || level === undefined) return null;
  if (!managed) return 'locked';
  const catalogLevel = catalogLevels.get(slotKey(grant.applicationId, resource))?.find(item => item.level === level);
  if (!catalogLevel) return 'ineligible';
  if (!catalogLevel.heldByYou) return 'not-held';
  return null;
}

/**
 * The admin-editable baseline: a grant seeds a slot only when it is `managed`, still names a
 * resource/level, the catalog still offers that exact level for that application/resource, and the
 * current viewer holds it. A staff-assigned grant, one whose level is no longer bot-grantable, and one
 * held only by a different admin are all excluded here — `PermissionsMatrix` renders them read-only (or
 * blocks the save) instead of letting them ride along as an unremovable, unsaveable seed.
 */
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

/**
 * Grants that are still on a catalogued resource but whose exact level stopped being bot-grantable —
 * always dropped on save. `desired[slot]` alone can't tell "untouched" from "explicitly resolved" apart
 * from "the admin chose a *different* value" — a sibling grant at the same slot (see `baseline`) seeds
 * `desired[slot]` on mount with no action from the admin at all, so comparing against `undefined`/`null`
 * treats that seed as a resolution and undercounts. Counted whenever the admin hasn't demonstrably acted
 * on this exact slot (same test as `unresolvedNotHeldGrants`): untouched, or explicitly cleared to
 * "No access", both leave nothing else here to account for the removal. Once the admin instead chooses a
 * *replacement* level, `countChangedSlots` already counts that one edit (nothing → the new level) —
 * counting the stale grant too would double it.
 */
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

/**
 * Resolution is per-*grant*, not per-*slot*: a slot can hold a second, higher-level grant (managed or
 * staff-assigned) that seeds — or occupies — `desired[slot]` without the admin ever having acted on
 * *this* grant. So a not-held grant only counts as resolved when the admin has demonstrably touched it:
 * explicit "No access" (`null`), or a level that actually differs from what this slot started at.
 * Comparing against `baseline` rather than `undefined` is what makes that distinction possible — an
 * untouched slot keeps `baseline[slot]`'s identity (and level) all the way through, whatever else seeded it.
 */
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

/**
 * A not-held grant is never seeded into the baseline, so explicitly removing one (picking "No access")
 * leaves `desired` looking identical to the untouched baseline — both resolve to "no entry" for that
 * slot — and `countChangedSlots` alone would miss it. Counted separately so that resolving the one thing
 * blocking Save still shows up as something to save.
 */
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

/** The stale-grant twin of `resolvedNotHeldRemovals`, for the same reason: explicitly clearing a slot with no editable sibling resolves to "no entry", same as untouched, so it needs its own unconditional count. */
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

/**
 * Managed grants with no resource/level to name (the role stopped being bot-grantable entirely) have no
 * row and no `desired` slot to act on — they're dropped by any save regardless, same as `staleLevelGrants`,
 * so they're always counted rather than leaving the "No longer available" block's promise un-actionable.
 */
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

function isLevelDisabled(level: BotCatalogLevelItem): boolean {
  return !level.eligible || !level.heldByYou;
}

function disabledReasonText(level: BotCatalogLevelItem, hasReadLevel: boolean): string {
  const reason = !level.eligible ? 'not available to bots' : 'you don’t hold this permission';
  return `${levelLabel(level.level, hasReadLevel)}: ${reason}`;
}

/**
 * Adds a synthetic, always-disabled entry for the currently-granted level when the catalog no longer
 * lists it (the role stopped being bot-grantable, or an admin lost the underlying permission) — so the
 * control still shows the true current state instead of silently defaulting to "No access".
 */
function displayLevelsFor(resource: BotCatalogResourceItem, currentGrant: BotGrantItem | undefined): BotCatalogLevelItem[] {
  const levels = [...resource.levels];
  if (currentGrant?.level !== undefined && !levels.some(level => level.level === currentGrant.level)) {
    levels.push({ roleId: currentGrant.roleId, roleName: currentGrant.roleName, level: currentGrant.level, sensitive: currentGrant.sensitive, eligible: false, heldByYou: false });
  }
  return levels.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

function primaryDescription(levels: BotCatalogLevelItem[]): string | undefined {
  return levels.find(level => level.sensitive)?.description ?? levels.find(level => level.level === 'read')?.description ?? levels[0]?.description;
}

interface MatrixRowProps {
  rowId: string;
  applicationName: string;
  resource: BotCatalogResourceItem;
  currentGrant: BotGrantItem | undefined;
  /** A staff-assigned grant sharing this slot with `currentGrant` — shown as a note, never drives the control. */
  coexistingLockedGrant: BotGrantItem | undefined;
  exclusionReason: GrantExclusionReason;
  selected: BotGrantLevel | 'none';
  flagDismissed: boolean;
  onSelect: (level: BotGrantLevel | 'none') => void;
  onDismissFlag: () => void;
}

function MatrixRow({
  rowId,
  applicationName,
  resource,
  currentGrant,
  coexistingLockedGrant,
  exclusionReason,
  selected,
  flagDismissed,
  onSelect,
  onDismissFlag,
}: MatrixRowProps): React.JSX.Element {
  const locked = exclusionReason === 'locked';
  const staleLevel = exclusionReason === 'ineligible';
  const levels = displayLevelsFor(resource, currentGrant);
  const hasReadLevel = levels.some(level => level.level === 'read');
  const sensitive = levels.some(level => level.sensitive);
  const description = primaryDescription(levels);
  const flagged = !locked && currentGrant?.granterHoldsPermission === false && !flagDismissed;
  const reasons = locked
    ? []
    : levels.filter(level => isLevelDisabled(level) && !(staleLevel && level.level === currentGrant?.level)).map(level => disabledReasonText(level, hasReadLevel));
  const reasonId = `${rowId}-reason`;
  const hasNotes = locked || staleLevel || reasons.length > 0 || coexistingLockedGrant !== undefined;

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>
          {humanizeResource(resource.resource)}
          {sensitive && (
            <Badge intent="warning" size="sm">
              Sensitive
            </Badge>
          )}
        </div>
        {description && <p className={styles.rowDesc}>{description}</p>}
        {hasNotes && (
          <div id={reasonId} className={styles.rowNotes}>
            {locked && <p className={styles.rowNote}>Assigned by platform staff — not editable here.</p>}
            {staleLevel && <p className={styles.rowNote}>No longer available to bots — removed when you save.</p>}
            {!locked && reasons.length > 0 && <p className={styles.rowNote}>{reasons.join(' · ')}</p>}
            {coexistingLockedGrant?.level !== undefined && (
              <p className={styles.rowNote}>
                Platform staff separately assigned {levelLabel(coexistingLockedGrant.level, hasReadLevel)} here — that assignment isn’t shown or changed by this control.
              </p>
            )}
          </div>
        )}
        {flagged && currentGrant && (
          <div className={styles.flagNote}>
            <span className={styles.flagText}>
              {currentGrant.grantedBy?.displayName ?? 'An administrator'} granted this, but no longer holds the permission. Keep it, or remove it.
            </span>
            <Button variant="ghost" size="sm" onClick={onDismissFlag}>
              Keep
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onSelect('none')}>
              Remove
            </Button>
          </div>
        )}
      </div>
      <SegmentedControl
        aria-label={`${applicationName} ${humanizeResource(resource.resource)} permission`}
        aria-describedby={hasNotes ? reasonId : undefined}
        value={selected}
        onValueChange={value => onSelect(value as BotGrantLevel | 'none')}
        disabled={locked}
        size="sm"
      >
        <SegmentedControl.Item value="none">No access</SegmentedControl.Item>
        {levels.map(level => (
          <SegmentedControl.Item key={level.level} value={level.level} disabled={locked || isLevelDisabled(level)}>
            {levelLabel(level.level, hasReadLevel)}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
    </div>
  );
}

export interface PermissionsMatrixProps {
  applications: BotCatalogApplicationItem[];
  grants?: BotGrantItem[];
  desired: DesiredGrantMap;
  onDesiredChange: (next: DesiredGrantMap) => void;
}

export function PermissionsMatrix({ applications, grants = [], desired, onDesiredChange }: PermissionsMatrixProps): React.JSX.Element {
  const [dismissedFlags, setDismissedFlags] = useState<Set<number>>(() => new Set());

  const catalogLevels = useMemo(() => catalogLevelsBySlot(applications), [applications]);

  /**
   * Two roles can occupy the same resource slot at once — a staff-assigned grant alongside an
   * admin-managed one, or two managed grants at different levels (nothing in `replaceGrants` prevents
   * either). The row's control always drives off the highest-level *managed* grant, since that's the one
   * the admin can actually act on; a staff grant sharing the slot is surfaced as its own read-only note
   * instead of silently winning the row and leaving the managed grant with no control at all.
   */
  const { managedBySlot, lockedBySlot } = useMemo(() => {
    const managed = new Map<string, BotGrantItem>();
    const locked = new Map<string, BotGrantItem>();
    for (const grant of grants) {
      if (grant.resource === undefined || grant.level === undefined) continue;
      const key = slotKey(grant.applicationId, grant.resource);
      const bucket = grant.managed ? managed : locked;
      const existing = bucket.get(key);
      if (existing?.level !== undefined && LEVEL_ORDER[existing.level] >= LEVEL_ORDER[grant.level]) continue;
      bucket.set(key, grant);
    }
    return { managedBySlot: managed, lockedBySlot: locked };
  }, [grants]);

  const catalogSlots = useMemo(() => {
    const set = new Set<string>();
    for (const app of applications) for (const resource of app.resources) set.add(slotKey(app.applicationId, resource.resource));
    return set;
  }, [applications]);

  const orphanGrants = useMemo(
    () => grants.filter(grant => grant.resource === undefined || grant.level === undefined || !catalogSlots.has(slotKey(grant.applicationId, grant.resource))),
    [grants, catalogSlots],
  );

  const setSlot = (applicationId: number, resource: string, level: BotGrantLevel | 'none'): void => {
    const key = slotKey(applicationId, resource);
    onDesiredChange({ ...desired, [key]: level === 'none' ? null : { applicationId, resource, level } });
  };

  if (applications.length === 0 && orphanGrants.length === 0) return <p className={styles.empty}>No applications in this organization declare bot-grantable permissions yet.</p>;

  return (
    <div className={styles.root}>
      {applications.map(app => (
        <section key={app.applicationId} className={styles.appSection}>
          <div className={styles.appHead}>
            <Avatar name={app.displayName ?? app.name} shape="square" size="sm" />
            <span className={styles.appName}>{app.displayName ?? app.name}</span>
          </div>
          <div className={styles.rows}>
            {app.resources.map(resource => {
              const slot = slotKey(app.applicationId, resource.resource);
              const managedGrant = managedBySlot.get(slot);
              const lockedGrant = lockedBySlot.get(slot);
              const currentGrant = managedGrant ?? lockedGrant;
              const coexistingLockedGrant = managedGrant && lockedGrant ? lockedGrant : undefined;
              const exclusionReason = currentGrant ? classifyGrant(catalogLevels, currentGrant) : null;
              const desiredEntry = desired[slot];
              const selected: BotGrantLevel | 'none' = desiredEntry === undefined ? (exclusionReason ? (currentGrant?.level ?? 'none') : 'none') : (desiredEntry?.level ?? 'none');
              return (
                <MatrixRow
                  key={slot}
                  rowId={slot}
                  applicationName={app.displayName ?? app.name}
                  resource={resource}
                  currentGrant={currentGrant}
                  coexistingLockedGrant={coexistingLockedGrant}
                  exclusionReason={exclusionReason}
                  selected={selected}
                  flagDismissed={currentGrant ? dismissedFlags.has(currentGrant.roleId) : false}
                  onSelect={level => setSlot(app.applicationId, resource.resource, level)}
                  onDismissFlag={() => setDismissedFlags(prev => new Set(prev).add(currentGrant?.roleId ?? -1))}
                />
              );
            })}
          </div>
        </section>
      ))}
      {orphanGrants.length > 0 && (
        <section className={styles.appSection}>
          <div className={styles.appHead}>
            <span className={styles.appName}>No longer available</span>
          </div>
          <p className={styles.rowDesc}>
            These reference a permission that no longer exists, or that this organization can no longer reach. Managed ones are removed automatically the next time you save.
          </p>
          <div className={styles.rows}>
            {orphanGrants.map(grant => (
              <div key={grant.roleId} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {grant.applicationDisplayName ?? grant.application} · {grant.roleName}
                  </div>
                  <p className={styles.rowNote}>{grant.managed ? 'Will be removed when you save permissions.' : 'Assigned by platform staff.'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

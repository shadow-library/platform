import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, SegmentedControl } from '@shadow-library/ui';

import { type BotCatalogApplicationItem, type BotCatalogLevelItem, type BotCatalogResourceItem, type BotGrantItem, type BotGrantLevel } from '@/lib/apis';
import { catalogLevelsBySlot, classifyGrant, type DesiredGrantMap, type GrantExclusionReason, humanizeResource, LEVEL_ORDER, levelLabel, slotKey } from '@/lib/bot-permissions';

import styles from './permissions-matrix.module.css';

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

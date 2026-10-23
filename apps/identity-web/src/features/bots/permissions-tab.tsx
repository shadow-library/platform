import { useMemo, useState } from 'react';
import { Alert, Button, toast } from '@shadow-library/ui';

import { QueryState } from '@/components/si';
import { type ApiError, type BotCatalogApplicationItem, type BotGrantItem, useReplaceBotPermissionsMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import {
  baselineFromGrants,
  countChangedSlots,
  type DesiredGrantMap,
  desiredGrantsList,
  resolvedNotHeldRemovals,
  resolvedStaleRemovals,
  staleLevelGrants,
  unrepresentableManagedGrantCount,
  unresolvedNotHeldGrants,
} from '@/lib/bot-permissions';
import { PermissionsMatrix } from './permissions-matrix';
import styles from './bots.module.css';

interface PermissionsTabProps {
  orgId: string;
  botId: string;
  applications: BotCatalogApplicationItem[];
  catalogLoading: boolean;
  catalogError: ApiError | null;
  grants: BotGrantItem[];
  grantsLoading: boolean;
  grantsError: ApiError | null;
  require: (action: () => void) => void;
}

export function PermissionsTab({ orgId, botId, applications, catalogLoading, catalogError, grants, grantsLoading, grantsError, require }: PermissionsTabProps): React.JSX.Element {
  const replace = useReplaceBotPermissionsMutation(orgId);
  const baseline = useMemo(() => baselineFromGrants(applications, grants), [applications, grants]);
  const [desired, setDesired] = useState<DesiredGrantMap>(baseline);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [syncedBaseline, setSyncedBaseline] = useState(baseline);

  if (syncedBaseline !== baseline) {
    setSyncedBaseline(baseline);
    setDesired(baseline);
  }

  const stale = useMemo(() => staleLevelGrants(applications, grants, baseline, desired), [applications, grants, baseline, desired]);
  const notHeld = useMemo(() => unresolvedNotHeldGrants(applications, grants, baseline, desired), [applications, grants, baseline, desired]);
  const changedCount =
    countChangedSlots(baseline, desired) +
    stale.length +
    resolvedNotHeldRemovals(applications, grants, desired) +
    resolvedStaleRemovals(applications, grants, desired) +
    unrepresentableManagedGrantCount(grants);

  const discard = (): void => {
    setDesired(baseline);
    setSaveError(null);
  };

  const save = (): void => {
    setSaveError(null);
    require(() => replace.mutate({ botId, grants: desiredGrantsList(desired) }, { onSuccess: () => toast.success('Permissions updated'), onError: error => setSaveError(error) }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>Permissions</h2>
          <p className={styles.tabDesc}>Grants belong to the organization, not to the admin who made them. Changes reach every app within a minute.</p>
        </div>
      </div>

      {saveError && (
        <Alert intent="danger" title="Couldn’t save permissions">
          {botErrorMessage(saveError)}
        </Alert>
      )}

      {notHeld.length > 0 && (
        <Alert intent="warning" title="Some grants aren’t yours to keep">
          <ul className={styles.notHeldList}>
            {notHeld.map(entry => (
              <li key={`${entry.applicationId}-${entry.resource}`}>
                You don’t hold {entry.applicationName} · {entry.resourceLabel} · {entry.levelLabel} — remove it explicitly
                {entry.hasSibling ? ' (which also clears the other grant on that resource)' : ''}, or ask someone who does.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className={styles.detailCard}>
        <QueryState isLoading={catalogLoading || grantsLoading} error={catalogError ?? grantsError} isEmpty={false}>
          <PermissionsMatrix applications={applications} grants={grants} desired={desired} onDesiredChange={setDesired} />
        </QueryState>
      </div>

      {changedCount > 0 && (
        <div className={styles.unsavedBar}>
          <span className={styles.unsavedDot} />
          <span className={styles.unsavedText}>
            <strong>
              {changedCount} unsaved change{changedCount === 1 ? '' : 's'}
            </strong>
          </span>
          <Button variant="ghost" size="sm" onClick={discard}>
            Discard
          </Button>
          <Button variant="primary" size="sm" loading={replace.isPending} disabled={notHeld.length > 0} onClick={save}>
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}

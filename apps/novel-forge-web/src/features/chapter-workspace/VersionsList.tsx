import { useId, useState } from 'react';
import { Button, ConfirmDialog, toast } from '@shadow-library/ui';

import { PaneError, PaneLoader } from '@/components/nf';
import { type DraftResponse, type DraftVersionResponse, isApiError, useDraftVersionsQuery, useRestoreVersionMutation } from '@/lib/apis';
import { type SettledBase, unsettledMessage } from '@/lib/chapter-editor';
import { relativeTime } from '@/lib/format';
import { FINAL_RESTORE_REASON, restoreConsequences, restoredMessage, restoreGate, versionSourceLabel } from '@/lib/draft-versions';
import { writeRefusalMessage } from '@/lib/passage-suggestions';

import { CompareVersionsDialog } from './CompareVersionsDialog';
import styles from './ChapterDetails.module.css';
import { useSingleFlight } from './use-single-flight';

export interface VersionsListProps {
  novelId: string;
  draft: DraftResponse;
  generating: boolean;
  settledBase: () => Promise<SettledBase>;
}

export function VersionsList({ novelId, draft, generating, settledBase }: VersionsListProps): React.JSX.Element {
  const chapter = draft.chapter;
  const versionsQuery = useDraftVersionsQuery(novelId, chapter);
  const restore = useRestoreVersionMutation(novelId, chapter);
  const [confirming, setConfirming] = useState<DraftVersionResponse | undefined>();
  const [pair, setPair] = useState<{ a: number; b: number } | undefined>();
  const versions = versionsQuery.data?.items ?? [];
  const flight = useSingleFlight();
  const reasonId = useId();

  if (versionsQuery.isLoading) return <PaneLoader />;
  if (versionsQuery.error) return <PaneError error={versionsQuery.error} />;

  const runRestore = (version: DraftVersionResponse): Promise<unknown> =>
    flight.run(async () => {
      const settled = await settledBase();
      if (settled.kind === 'unsettled') {
        setConfirming(undefined);
        toast.warning(unsettledMessage(settled.status));
        return;
      }
      const { base } = settled;
      try {
        const restored = await restore.mutateAsync({ revision: version.revision, base: { baseDraftId: base.draftId, baseRevision: base.revision, baseSaveSeq: base.saveSeq } });
        toast.success(restoredMessage(base, restored, version.revision));
      } catch (error) {
        toast.warning(isApiError(error) ? writeRefusalMessage(error) : 'The restore didn’t go through — try again.');
      } finally {
        setConfirming(undefined);
      }
    });

  return (
    <div className={styles.tab}>
      {draft.status === 'final' && (
        <span id={reasonId} className={styles.muted}>
          {FINAL_RESTORE_REASON}
        </span>
      )}
      {versions.map(version => {
        const gate = restoreGate(draft, version, generating);
        const cardReasonId = `${reasonId}-${version.revision}`;
        const compare = (): void => setPair({ a: version.revision, b: draft.revision });
        return (
          <div key={version.revision} className={styles.version} data-current={version.current || undefined}>
            <span className={styles.versionHead}>
              <b className={styles.name}>Version {version.revision}</b>
              <span className={styles.muted}>{relativeTime(version.createdAt)}</span>
              {version.current ? <span className={styles.badge}>Current</span> : version.approved && <span className={styles.badge}>Approved</span>}
            </span>
            <span>{version.current ? 'The text on screen' : versionSourceLabel(version)}</span>
            {!version.current && (
              <span className={styles.versionActions}>
                <Button variant="ghost" size="sm" onClick={compare}>
                  Compare with current
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!gate.allowed || flight.busy}
                  aria-describedby={gate.allowed ? undefined : draft.status === 'final' ? reasonId : cardReasonId}
                  onClick={() => setConfirming(version)}
                >
                  Restore as a new version
                </Button>
              </span>
            )}
            {!version.current && !gate.allowed && draft.status !== 'final' && (
              <span id={cardReasonId} className={styles.meta}>
                {gate.reason}
              </span>
            )}
          </div>
        );
      })}
      {versions.length > 1 && (
        <Button variant="secondary" size="sm" onClick={() => setPair({ a: versions[1]?.revision ?? draft.revision, b: draft.revision })}>
          Compare any two versions
        </Button>
      )}
      <span className={styles.meta}>The newest 50 versions and the one you approved are kept.</span>

      {pair && (
        <CompareVersionsDialog novelId={novelId} chapter={chapter} versions={versions} pair={pair} onPairChange={setPair} onOpenChange={open => !open && setPair(undefined)} />
      )}
      <ConfirmDialog
        open={confirming !== undefined}
        onOpenChange={open => !open && !flight.busy && setConfirming(undefined)}
        title={`Restore version ${confirming?.revision ?? ''}?`}
        description={
          confirming && (
            <span className={styles.section}>
              {restoreConsequences(draft, confirming).map(line => (
                <span key={line}>{line}</span>
              ))}
            </span>
          )
        }
        confirmLabel="Restore as a new version"
        loading={flight.busy}
        onConfirm={() => confirming && void runRestore(confirming)}
      />
    </div>
  );
}

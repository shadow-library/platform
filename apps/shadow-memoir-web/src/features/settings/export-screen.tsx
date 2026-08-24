import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Badge, Button, Card, Skeleton, Spinner } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type ExportStage, useAccountCommand, useExportView } from '@/lib/data';

import styles from './settings.module.css';

const STAGE_LABELS: Record<Exclude<ExportStage, 'idle'>, { label: string; intent: 'info' | 'success' | 'warning' }> = {
  preparing: { label: 'Preparing', intent: 'info' },
  ready: { label: 'Ready', intent: 'success' },
  failed: { label: 'Did not finish', intent: 'warning' },
};

export function ExportScreen(): ReactElement {
  const view = useExportView();
  const command = useAccountCommand();
  const stage = view.data?.job.stage ?? 'idle';

  return (
    <Screen
      title="Data export"
      subtitle="One archive with every record you have created, in formats you can open without this app. Exporting changes nothing."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      {view.isPending || !view.data ? <Skeleton.Card /> : null}

      {view.data ? (
        <ScreenColumns
          aside={
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>How the link works</h2>
              <p className={screenStyles.cardBody}>
                The archive is assembled on the server and handed back as a link that expires on its own. There is no library of past archives to keep — ask again whenever you want
                a fresh one, within the daily limit.
              </p>
            </Card>
          }
        >
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>Export everything</h2>
            <div className={styles.sets}>
              {view.data.sets.map(set => (
                <div key={set.name} className={styles.set}>
                  <div className={styles.setName}>{set.name}</div>
                  <p className={styles.setMeta}>{set.meta}</p>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <Button variant="primary" disabled={stage === 'preparing'} onClick={() => command.mutate({ type: 'export.prepare' })}>
                Prepare the export
              </Button>
              <span className={styles.jobWhen}>Usually under a minute, and you can leave the page.</span>
            </div>
          </Card>

          {stage !== 'idle' ? (
            <Card padding="lg">
              <div className={styles.jobHead}>
                <Badge variant="soft" intent={STAGE_LABELS[stage].intent}>
                  {STAGE_LABELS[stage].label}
                </Badge>
                <span className={styles.jobWhen}>{view.data.job.when}</span>
                {stage === 'preparing' ? <Spinner size="sm" /> : null}
              </div>
              <p className={screenStyles.cardBody}>{view.data.job.body}</p>
              <div className={styles.actions}>
                {view.data.job.downloadUrl ? (
                  <Button variant="primary" asChild>
                    <a href={view.data.job.downloadUrl}>Download the archive</a>
                  </Button>
                ) : null}
                {stage === 'failed' ? (
                  <Button variant="primary" onClick={() => command.mutate({ type: 'export.prepare' })}>
                    Try again
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => command.mutate({ type: 'export.dismiss' })}>
                  Clear
                </Button>
              </div>
            </Card>
          ) : null}
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}
